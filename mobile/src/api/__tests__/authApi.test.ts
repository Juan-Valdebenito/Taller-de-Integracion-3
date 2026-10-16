import * as SecureStore from 'expo-secure-store';

import { getTokens, saveTokens } from '../../storage/tokenStorage';
import { bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
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
    expect(bodyOf(fetchMock, 0)).toEqual({ name: 'Ana Pasajera', email: 'ana@correo.cl', password: 'secreta123' });
    await expect(getTokens()).resolves.not.toBeNull();
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
});

describe('logout', () => {
  it('revoca el refresh token en el servidor y borra los tokens locales', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { message: 'Sesión cerrada correctamente' } }));

    await logout();

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/logout$/);
    expect(bodyOf(fetchMock, 0)).toEqual({ refreshToken: 'refresh-1' });
    await expect(getTokens()).resolves.toBeNull();
  });

  it('borra los tokens locales aunque el servidor no responda', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(logout()).resolves.toBeUndefined();
    await expect(getTokens()).resolves.toBeNull();
  });
});
