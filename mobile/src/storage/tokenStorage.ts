/**
 * Almacenamiento cifrado de los tokens JWT con expo-secure-store.
 *
 * - iOS: Keychain. Android: valores cifrados con una clave del Android Keystore.
 * - WHEN_UNLOCKED_THIS_DEVICE_ONLY: los tokens solo se leen con el dispositivo
 *   desbloqueado y no se copian a respaldos ni a otro teléfono.
 * - Nunca se guardan en AsyncStorage (texto plano).
 */
import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '../auth/types';

// SecureStore solo admite claves con letras, números, ".", "-" y "_".
export const ACCESS_TOKEN_KEY = 'transithub.accessToken';
export const REFRESH_TOKEN_KEY = 'transithub.refreshToken';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Guarda (o reemplaza) el par de tokens. */
export async function saveTokens({ accessToken, refreshToken }: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, STORE_OPTIONS),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, STORE_OPTIONS),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY, STORE_OPTIONS);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS);
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
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY, STORE_OPTIONS),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, STORE_OPTIONS),
  ]);
}
