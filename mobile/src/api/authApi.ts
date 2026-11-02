/**
 * Operaciones de autenticación contra backend-go (/api/v1/auth/*).
 * Los tokens se guardan cifrados con expo-secure-store (ver storage/tokenStorage).
 */
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '../auth/types';
import { clearTokens, getRefreshToken, getTokens, saveTokens } from '../storage/tokenStorage';
import { apiRequest } from './client';
import { ApiError } from './errors';

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

/** POST /auth/register (pasajero o empresa, como el web). Guarda los tokens y devuelve el usuario. */
export async function register({ name, email, password, role = 'PASSENGER' }: RegisterInput): Promise<AuthUser> {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    auth: false,
    body: { name: name.trim(), email: email.trim().toLowerCase(), password, role },
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

export interface LogoutResult {
  /**
   * true si el servidor confirmó que ambos tokens quedaron en la lista negra
   * (o ya no eran válidos). false si no se pudo confirmar (ej. sin conexión):
   * en ese caso los tokens siguen vigentes en el servidor hasta que venzan.
   */
  serverConfirmed: boolean;
}

/**
 * POST /auth/logout: envía el access token (header) y el refresh token (body)
 * a la lista negra de backend-go. Los tokens locales se borran siempre, aunque
 * el servidor no responda.
 */
export async function logout(): Promise<LogoutResult> {
  let serverConfirmed = false;
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
    serverConfirmed = true;
  } catch (error) {
    // 401: los tokens ya no eran válidos en el servidor (vencidos o revocados),
    // así que no queda nada que revocar. Cualquier otro error: sin confirmar.
    serverConfirmed = error instanceof ApiError && error.status === 401;
  } finally {
    await clearTokens();
  }
  return { serverConfirmed };
}
