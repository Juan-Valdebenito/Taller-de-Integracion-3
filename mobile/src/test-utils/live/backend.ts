/**
 * Utilidades de las pruebas en vivo contra backend-go real.
 *
 * Corren solo con `npm run test:live:backend` (scripts/live-backend.mjs), que
 * levanta el backend y define LIVE_BACKEND=1. Con `npm run test:live` a secas
 * (sin backend) se omiten.
 */
import * as SecureStore from 'expo-secure-store';

import { API_URL } from '../../config';

export const LIVE_BACKEND = process.env.LIVE_BACKEND === '1';

/** describe que solo corre con el backend levantado por el script. */
export const describeLive = LIVE_BACKEND ? describe : describe.skip;

/** Pasajero que crea el seed de backend-go (internal/seed). */
export const SEED_PASSENGER = { email: 'carlos.pasajero@gmail.com', password: 'Pasajero1234!' };

/** Duración del access token con que se levantó el backend (LIVE_JWT_ACCESS_EXPIRES_IN). */
export const ACCESS_TTL_SECONDS = Number.parseInt(process.env.LIVE_JWT_ACCESS_EXPIRES_IN ?? '5s', 10);

/** Borra los tokens guardados (SecureStore en memoria) entre pruebas. */
export function resetSecureStore(): void {
  (SecureStore as unknown as { __reset: () => void }).__reset();
}

/** GET /auth/me con un token dado, sin pasar por el interceptor. */
export async function rawMe(accessToken: string): Promise<Response> {
  return fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

/** POST /auth/refresh con un refresh token dado, sin pasar por el interceptor. */
export async function rawRefresh(refreshToken: string): Promise<Response> {
  return fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

/**
 * POST /auth/logout con un par de tokens, sin pasar por la app: como si la
 * sesión se cerrara desde otro dispositivo. backend-go revoca ambos tokens.
 */
export async function rawLogout(tokens: { accessToken: string; refreshToken: string }): Promise<Response> {
  return fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
}

export interface RecordedCall {
  /** Ruta relativa a la API, ej. "/auth/refresh". */
  path: string;
  status: number;
  authorization?: string;
}

/**
 * Registra las solicitudes que salen hacia backend-go (y sus respuestas) sin
 * cambiarlas: envuelve el fetch real. Llamar a stop() al terminar.
 */
export function recordRequests() {
  const calls: RecordedCall[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await realFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path: url.replace(API_URL, ''), status: response.status, authorization: headers.Authorization });
    return response;
  }) as typeof fetch;
  return {
    calls,
    stop: () => {
      globalThis.fetch = realFetch;
    },
  };
}

/** Espera a que venza (de verdad, en backend-go) el access token recién emitido. */
export function waitForAccessTokenExpiry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, (ACCESS_TTL_SECONDS + 1.5) * 1000));
}
