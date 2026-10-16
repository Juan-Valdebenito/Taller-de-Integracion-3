import * as SecureStore from 'expo-secure-store';

import { getTokens, saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { ApiError, apiRequest, setSessionExpiredHandler } from '../client';

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

describe('apiRequest', () => {
  it('envía el access token guardado en Authorization', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { ok: true } }));

    await expect(apiRequest('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/me$/);
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-old');
  });

  it('no envía token en solicitudes sin autenticación', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: {} }));

    await apiRequest('/auth/login', { method: 'POST', auth: false, body: { email: 'a@b.cl' } });
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
  });

  it('ante un 401 renueva los tokens, los guarda rotados y reintenta una vez', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Token expirado' } }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ body: { id: '1' } }));

    await expect(apiRequest('/auth/me')).resolves.toEqual({ id: '1' });

    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(bodyOf(fetchMock, 1)).toEqual({ refreshToken: 'refresh-old' });
    expect(authHeaderOf(fetchMock, 1)).toBeUndefined();
    expect(authHeaderOf(fetchMock, 2)).toBe('Bearer access-new');
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it('comparte una sola renovación entre solicitudes simultáneas (el refresh token se rota)', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (url.endsWith('/auth/refresh')) return refreshed;
      return auth === 'Bearer access-new' ? fakeResponse({ body: { ok: true } }) : fakeResponse({ status: 401 });
    });

    await Promise.all([apiRequest('/a'), apiRequest('/b'), apiRequest('/c')]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('si la renovación falla, borra los tokens y avisa que la sesión expiró', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Refresh token ya utilizado o revocado' } }));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('sin conexión durante la renovación no cierra la sesión', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401 })).mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ status: 0 });
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.not.toBeNull();
  });

  it('usa el mensaje de error del backend', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Credenciales inválidas' } }));

    await expect(apiRequest('/auth/login', { method: 'POST', auth: false })).rejects.toEqual(
      new ApiError(401, 'Credenciales inválidas'),
    );
  });

  it('expone el tiempo de espera de una respuesta 429 (rate limiting)', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 429,
        headers: { 'Retry-After': '42' },
        body: { error: 'Demasiadas solicitudes. Intenta nuevamente en 42 segundos.', retryAfter: 42 },
      }),
    );

    const error = (await apiRequest('/auth/login', { method: 'POST', auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.retryAfter).toBe(42);
    expect(error.message).toContain('42 segundos');
  });

  it('traduce un fallo de red a un mensaje para el usuario', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('No se pudo conectar'),
    });
  });

  it('evalúa el body en cada intento (reintento tras renovar usa datos nuevos)', async () => {
    let calls = 0;
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ body: {} }));

    await apiRequest('/auth/logout', { method: 'POST', body: () => ({ intento: ++calls }) });

    expect(bodyOf(fetchMock, 0)).toEqual({ intento: 1 });
    expect(bodyOf(fetchMock, 2)).toEqual({ intento: 2 });
  });
});
