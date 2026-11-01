import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getTokens,
  saveTokens,
} from '../tokenStorage';

const mockStore = SecureStore as unknown as typeof SecureStore & {
  __reset: () => void;
  __dump: () => Record<string, string>;
};

beforeEach(() => mockStore.__reset());

describe('tokenStorage', () => {
  it('guarda ambos tokens cifrados con acceso solo en este dispositivo y desbloqueado', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(mockStore.__dump()).toEqual({ [ACCESS_TOKEN_KEY]: 'access-1', [REFRESH_TOKEN_KEY]: 'refresh-1' });
    for (const call of (SecureStore.setItemAsync as jest.Mock).mock.calls) {
      expect(call[2]).toEqual({ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
  });

  it('usa claves válidas para SecureStore (letras, números, ".", "-" y "_")', () => {
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });

  it('lee los tokens guardados', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await expect(getAccessToken()).resolves.toBe('access-1');
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('considera sin sesión si falta uno de los tokens', async () => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, 'solo-access');

    await expect(getTokens()).resolves.toBeNull();
  });

  it('reemplaza los tokens al rotarlos', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await saveTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('borra ambos tokens', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await clearTokens();

    expect(mockStore.__dump()).toEqual({});
    await expect(getTokens()).resolves.toBeNull();
  });
});

describe('vista previa web', () => {
  let session: Map<string, string>;

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
    session = new Map();
    // sessionStorage del navegador, simulado.
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => void session.set(key, value),
        removeItem: (key: string) => void session.delete(key),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('guarda la sesión en sessionStorage (el navegador no tiene almacenamiento cifrado)', async () => {
    await saveTokens({ accessToken: 'access-web', refreshToken: 'refresh-web' });

    expect(Object.fromEntries(session)).toEqual({ [ACCESS_TOKEN_KEY]: 'access-web', [REFRESH_TOKEN_KEY]: 'refresh-web' });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-web', refreshToken: 'refresh-web' });
  });

  it('cerrar sesión borra los tokens del navegador', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    await clearTokens();

    expect(session.size).toBe(0);
    await expect(getTokens()).resolves.toBeNull();
  });
});
