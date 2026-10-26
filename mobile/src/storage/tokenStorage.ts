/**
 * Almacenamiento cifrado de los tokens JWT con expo-secure-store.
 *
 * - iOS: Keychain. Android: valores cifrados con una clave del Android Keystore.
 * - WHEN_UNLOCKED_THIS_DEVICE_ONLY: los tokens solo se leen con el dispositivo
 *   desbloqueado y no se copian a respaldos ni a otro teléfono.
 * - Nunca se guardan en AsyncStorage (texto plano).
 *
 * Vista previa web: el navegador no tiene almacenamiento cifrado; se usa
 * sessionStorage (se borra al cerrar la pestaña). Solo para desarrollo.
 */
import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '../auth/types';
import { isWeb } from '../utils/platform';

// SecureStore solo admite claves con letras, números, ".", "-" y "_".
export const ACCESS_TOKEN_KEY = 'transithub.accessToken';
export const REFRESH_TOKEN_KEY = 'transithub.refreshToken';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const secureStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key, STORE_OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, STORE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, STORE_OPTIONS),
};

const browserStore: KeyValueStore = {
  get: async (key) => globalThis.sessionStorage?.getItem(key) ?? null,
  set: async (key, value) => globalThis.sessionStorage?.setItem(key, value),
  remove: async (key) => globalThis.sessionStorage?.removeItem(key),
};

const store = (): KeyValueStore => (isWeb() ? browserStore : secureStore);

/** Guarda (o reemplaza) el par de tokens. */
export async function saveTokens({ accessToken, refreshToken }: TokenPair): Promise<void> {
  await Promise.all([
    store().set(ACCESS_TOKEN_KEY, accessToken),
    store().set(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return store().get(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return store().get(REFRESH_TOKEN_KEY);
}

/** Devuelve el par completo, o null si falta alguno (sesión incompleta = sin sesión). */
export async function getTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
  if (!accessToken || !refreshToken) {
    return null;
  }
  return { accessToken, refreshToken };
}

/** Borra ambos tokens (logout o sesión expirada). */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    store().remove(ACCESS_TOKEN_KEY),
    store().remove(REFRESH_TOKEN_KEY),
  ]);
}
