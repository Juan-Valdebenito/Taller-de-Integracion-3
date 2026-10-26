import * as SecureStore from 'expo-secure-store';

import { clearTokens, getTokens, saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { ApiError } from '../errors';
import { authFetch, INVALID_REFRESH_RESPONSE, isSessionInvalid, setSessionExpiredHandler } from '../interceptor';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  setSessionExpiredHandler(null);
  await saveTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });
});

const refreshed = fakeResponse({
  body: { accessToken: 'access-new', refreshToken: 'refresh-new', user: { id: '1' } },
});

const headersOf = (call: number) => fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>;

describe('authFetch', () => {
  it('devuelve la respuesta sin leerla, también si es un error distinto de 401', async () => {
    const notFound = fakeResponse({ status: 404, body: { error: 'Reclamo no encontrado' } });
    fetchMock.mockResolvedValueOnce(notFound);

    await expect(authFetch('/complaints/x')).resolves.toBe(notFound);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envía un FormData tal cual, sin forzar Content-Type, y lo arma de nuevo al reintentar', async () => {
    const forms: FormData[] = [];
    const makeInit = jest.fn(() => {
      const form = new FormData();
      form.append('maskRegions', '[]');
      forms.push(form);
      return { method: 'POST', body: form };
    });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ status: 201, body: { id: 'img-1' } }));

    const response = await authFetch('/complaints/c1/attachments', makeInit);

    expect(response.status).toBe(201);
    expect(makeInit).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(forms[0]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(forms[1]);
    expect(forms[0]).not.toBe(forms[1]);
    // fetch pone el boundary del multipart solo si no hay Content-Type.
    expect(headersOf(2)).toEqual({ Authorization: 'Bearer access-new' });
  });

  it.each([
    ['objeto', { Accept: 'image/*' }],
    ['arreglo', [['Accept', 'image/*']]],
  ])('conserva los encabezados de quien llama (%s) y agrega Authorization', async (_kind, headers) => {
    fetchMock.mockResolvedValueOnce(fakeResponse());

    await authFetch('/complaints/c1/attachments/a1/file', { headers: headers as HeadersInit });

    expect(headersOf(0)).toEqual({ Accept: 'image/*', Authorization: 'Bearer access-old' });
  });

  it('conserva los encabezados de un objeto Headers', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse());
    const headers = new Headers({ Accept: 'image/*' });

    await authFetch('/complaints/c1/attachments/a1/file', { headers });

    // Headers guarda los nombres en minúscula.
    expect(headersOf(0)).toEqual({ accept: 'image/*', Authorization: 'Bearer access-old' });
  });

  it('no modifica las opciones que recibe', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse());
    const init = { method: 'GET', headers: { Accept: 'application/json' } };

    await authFetch('/auth/me', init);

    expect(init).toEqual({ method: 'GET', headers: { Accept: 'application/json' } });
  });

  it('sin autenticación no envía token ni intenta renovar ante un 401', async () => {
    const unauthorized = fakeResponse({ status: 401, body: { error: 'Credenciales inválidas' } });
    fetchMock.mockResolvedValueOnce(unauthorized);

    await expect(authFetch('/auth/login', { method: 'POST' }, { auth: false })).resolves.toBe(unauthorized);
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin tokens guardados no envía Authorization y cierra la sesión ante un 401', async () => {
    await clearTokens();
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401 }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
    // Sin refresh token no hay nada que renovar: no se llama a /auth/refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('si el reintento con el token nuevo también da 401, cierra la sesión', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ status: 401 }));

    await expect(authFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('sin conexión al renovar propaga el error y conserva los tokens', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 0 });
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
  });

  it('si el refresh responde 503, devuelve ese error y no cierra la sesión', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(
        fakeResponse({ status: 503, body: { error: 'No se pudo verificar el estado del token, intenta nuevamente' } }),
      );

    await expect(authFetch('/auth/me')).rejects.toMatchObject({
      status: 503,
      message: 'No se pudo verificar el estado del token, intenta nuevamente',
    });
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
  });

  it.each([
    ['vacío', undefined],
    ['sin refresh token', { accessToken: 'access-new' }],
    ['con tokens vacíos', { accessToken: '', refreshToken: '' }],
    ['con tokens que no son texto', { accessToken: 123, refreshToken: null }],
  ])('si el refresh responde 200 con un cuerpo %s, no guarda nada y conserva la sesión', async (_kind, body) => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 502, message: INVALID_REFRESH_RESPONSE });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
  });

  it('si el refresh responde 400, cierra la sesión', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 400, body: { error: 'refreshToken es requerido' } }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });
});

describe('isSessionInvalid', () => {
  it.each([401, 400])('un %i del refresh significa que la sesión ya no sirve', (status) => {
    expect(isSessionInvalid(new ApiError(status, 'x'))).toBe(true);
  });

  it.each([0, 429, 500, 502, 503])('un %i del refresh es pasajero: la sesión se conserva', (status) => {
    expect(isSessionInvalid(new ApiError(status, 'x'))).toBe(false);
  });

  it('un error que no viene de la API no cierra la sesión', () => {
    expect(isSessionInvalid(new Error('SecureStore no disponible'))).toBe(false);
    expect(isSessionInvalid(undefined)).toBe(false);
  });
});
