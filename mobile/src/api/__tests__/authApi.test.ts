import * as SecureStore from 'expo-secure-store';

import { getTokens, saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { login, logout, register, restoreSession } from '../authApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

const user = { id: 'u1', name: 'Ana Pasajera', email: 'ana@correo.cl', role: 'PASSENGER' };
const authResponse = fakeResponse({ body: { token: 'access-1', accessToken: 'access-1', refreshToken: 'refresh-1', user } });

beforeEach(() => {
  mockStore.__reset();
  fetchMock = installFetchMock();
});

describe('login', () => {
  it('envía las credenciales, guarda los tokens cifrados y devuelve el usuario', async () => {
    fetchMock.mockResolvedValueOnce(authResponse);

    await expect(login({ email: '  Ana@Correo.CL ', password: 'secreta123' })).resolves.toEqual(user);

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/login$/);
    expect(bodyOf(fetchMock, 0)).toEqual({ email: 'ana@correo.cl', password: 'secreta123' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('no guarda nada si las credenciales son inválidas', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Credenciales inválidas' } }));

    await expect(login({ email: 'ana@correo.cl', password: 'mala' })).rejects.toThrow('Credenciales inválidas');
    await expect(getTokens()).resolves.toBeNull();
  });
});

describe('register', () => {
  it('registra un pasajero y deja la sesión iniciada', async () => {
    fetchMock.mockResolvedValueOnce(authResponse);

    await register({ name: ' Ana Pasajera ', email: 'ANA@correo.cl', password: 'secreta123' });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/register$/);
    expect(bodyOf(fetchMock, 0)).toEqual({ name: 'Ana Pasajera', email: 'ana@correo.cl', password: 'secreta123', role: 'PASSENGER' });
    await expect(getTokens()).resolves.not.toBeNull();
  });

  it('registra una empresa si se elige ese tipo de usuario, como el web', async () => {
    fetchMock.mockResolvedValueOnce(authResponse);

    await register({ name: 'Buses Sur', email: 'buses@sur.cl', password: 'secreta123', role: 'COMPANY' });

    expect(bodyOf(fetchMock, 0)).toMatchObject({ role: 'COMPANY' });
  });
});

describe('restoreSession', () => {
  it('devuelve null sin consultar al servidor si no hay tokens guardados', async () => {
    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recupera el usuario con los tokens guardados', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: user }));

    await expect(restoreSession()).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/me$/);
  });

  it('devuelve null si la sesión guardada ya no es válida', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValue(fakeResponse({ status: 401 }));

    await expect(restoreSession()).resolves.toBeNull();
    await expect(getTokens()).resolves.toBeNull();
  });

  // Al abrir la app con el access token vencido: /auth/me da 401 y la renovación
  // falla por algo pasajero. No es "sin sesión": se entrega el error para que el
  // login ofrezca reintentar, y los tokens se conservan.
  it.each([
    [503, 'No se pudo verificar el estado del token, intenta nuevamente'],
    [500, undefined],
    [429, 'Demasiadas solicitudes. Intenta nuevamente en 30 segundos.'],
  ])('si la renovación responde %i, entrega el error y conserva los tokens', async (status, error) => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status, body: error ? { error } : undefined }));

    await expect(restoreSession()).rejects.toMatchObject({ status, ...(error ? { message: error } : {}) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('con 429 en la renovación entrega cuántos segundos esperar antes de reintentar', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(
        fakeResponse({ status: 429, headers: { 'Retry-After': '30' }, body: { error: 'Demasiadas solicitudes', retryAfter: 30 } }),
      );

    await expect(restoreSession()).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });

  it.each([
    ['el servidor no está disponible (503)', fakeResponse({ status: 503 }), 503],
    ['no hay conexión', new TypeError('Network request failed'), 0],
  ])('si al consultar /auth/me %s, entrega el error y conserva los tokens', async (_kind, result, status) => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    if (result instanceof Error) {
      fetchMock.mockRejectedValueOnce(result);
    } else {
      fetchMock.mockResolvedValueOnce(result);
    }

    await expect(restoreSession()).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('al reintentar cuando el backend se recupera, entra con el mismo refresh token', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 503 }));
    await expect(restoreSession()).rejects.toMatchObject({ status: 503 });

    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ body: { accessToken: 'access-2', refreshToken: 'refresh-2', user } }))
      .mockResolvedValueOnce(fakeResponse({ body: user }));

    await expect(restoreSession()).resolves.toEqual(user);
    expect(bodyOf(fetchMock, 3)).toEqual({ refreshToken: 'refresh-1' });
    expect(authHeaderOf(fetchMock, 4)).toBe('Bearer access-2');
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });
});

describe('logout', () => {
  it('envía el access token (header) y el refresh token (body) a la lista negra y borra los locales', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { message: 'Sesión cerrada correctamente', refreshRevoked: true } }));

    await expect(logout()).resolves.toEqual({ serverConfirmed: true });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/logout$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
    expect(bodyOf(fetchMock, 0)).toEqual({ refreshToken: 'refresh-1' });
    await expect(getTokens()).resolves.toBeNull();
  });

  it('sin conexión borra los tokens locales pero informa que el servidor no lo confirmó', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(logout()).resolves.toEqual({ serverConfirmed: false });
    await expect(getTokens()).resolves.toBeNull();
  });

  it('un error del servidor (500) tampoco cuenta como confirmado', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 500, body: { error: 'No se pudo cerrar la sesión' } }));

    await expect(logout()).resolves.toEqual({ serverConfirmed: false });
    await expect(getTokens()).resolves.toBeNull();
  });

  it('si los tokens ya no eran válidos en el servidor (401) no queda nada que revocar', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    // access vencido → intenta renovar → el refresh también fue revocado
    fetchMock.mockResolvedValue(fakeResponse({ status: 401 }));

    await expect(logout()).resolves.toEqual({ serverConfirmed: true });
    await expect(getTokens()).resolves.toBeNull();
  });
});
