/**
 * Operaciones de autenticación contra backend-go (/api/v1/auth/*).
 * Los tokens se guardan cifrados con expo-secure-store (ver storage/tokenStorage).
 */
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '../auth/types';
import { clearTokens, getRefreshToken, getTokens, saveTokens } from '../storage/tokenStorage';
import { ApiError, apiRequest } from './client';

async function storeSession(response: AuthResponse): Promise<AuthUser> {
  await saveTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
  return response.user;
}

/** POST /auth/login. Guarda los tokens y devuelve el usuario. */
export async function login({ email, password }: LoginInput): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: email.trim().toLowerCase(), password },
  });
  return storeSession(response);
}

/** POST /auth/register (rol pasajero). Guarda los tokens y devuelve el usuario. */
export async function register({ name, email, password }: RegisterInput): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    auth: false,
    body: { name: name.trim(), email: email.trim().toLowerCase(), password },
  });
  return storeSession(response);
}

/** GET /auth/me con el access token (se renueva solo si venció). */
export function getCurrentUser(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me');
}

/**
 * Recupera la sesión guardada al abrir la app. Devuelve null si no hay tokens
 * o si ya no son válidos. Errores de conexión se propagan (la sesión puede
 * seguir siendo válida y se reintenta después).
 */
export async function restoreSession(): Promise<AuthUser | null> {
  if (!(await getTokens())) {
    return null;
  }
  try {
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

/**
 * POST /auth/logout: revoca en el servidor el access token y el refresh token.
 * Los tokens locales se borran siempre, aunque el servidor no responda.
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      // Se lee en cada intento: si el access token venció y se renovó, se
      // revoca el refresh token NUEVO, no el que la renovación ya invalidó.
      body: async () => {
        const refreshToken = await getRefreshToken();
        return refreshToken ? { refreshToken } : undefined;
      },
    });
  } catch {
    // Sin conexión o token ya vencido: igual se cierra la sesión local.
  } finally {
    await clearTokens();
  }
}
