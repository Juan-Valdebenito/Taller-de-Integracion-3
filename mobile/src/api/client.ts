/**
 * Cliente HTTP de la API de backend-go.
 *
 * - Agrega "Authorization: Bearer <accessToken>" a las solicitudes autenticadas.
 * - Si una de ellas responde 401 (access token vencido, ~15 min), pide un par
 *   nuevo en POST /auth/refresh y reintenta UNA vez.
 * - Las renovaciones simultáneas comparten una sola llamada: backend-go rota el
 *   refresh token (cada uno sirve una vez), así que dos refresh en paralelo
 *   invalidarían la sesión.
 * - Si la renovación falla, borra los tokens y avisa con onSessionExpired.
 */
import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import type { AuthResponse } from '../auth/types';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../storage/tokenStorage';

/** Error de la API con un mensaje listo para mostrar al usuario. */
export class ApiError extends Error {
  /** Código HTTP; 0 si no hubo respuesta (sin conexión o timeout). */
  readonly status: number;
  /** Segundos de espera sugeridos por el servidor en respuestas 429. */
  readonly retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /**
   * Cuerpo JSON. Puede ser una función: se evalúa en cada intento, para que el
   * reintento tras renovar tokens envíe valores actualizados (ej. el refresh token nuevo).
   */
  body?: unknown | (() => unknown | Promise<unknown>);
  /** Enviar el access token y renovarlo si venció. Por defecto true. */
  auth?: boolean;
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

/** Registra quién reacciona cuando la sesión ya no se puede renovar (ej. volver al login). */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión expiró. Inicia sesión nuevamente.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró el recurso solicitado.',
  409: 'El recurso ya existe.',
  429: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  500: 'Error del servidor. Inténtalo más tarde.',
  503: 'El servicio no está disponible en este momento.',
};

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión a internet.');
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(response: Response, data: any): ApiError {
  const retryAfterHeader = Number(response.headers.get('Retry-After'));
  const retryAfter =
    typeof data?.retryAfter === 'number' ? data.retryAfter : Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
  const message =
    (typeof data?.error === 'string' && data.error) ||
    (typeof data?.message === 'string' && data.message) ||
    DEFAULT_MESSAGES[response.status] ||
    `Error inesperado (${response.status}).`;
  return new ApiError(response.status, message, retryAfter);
}

function buildInit(method: string, body: unknown, accessToken: string | null): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

let refreshInFlight: Promise<string> | null = null;

/**
 * Renueva el par de tokens con el refresh token guardado y devuelve el nuevo
 * access token. Llamadas simultáneas reutilizan la misma solicitud.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new ApiError(401, DEFAULT_MESSAGES[401]);
      }
      const response = await rawFetch('/auth/refresh', buildInit('POST', { refreshToken }, null));
      const data = await readJson(response);
      if (!response.ok) {
        throw toApiError(response, data);
      }
      const tokens = data as AuthResponse;
      await saveTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      return tokens.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function expireSession(): Promise<never> {
  await clearTokens();
  onSessionExpired?.();
  throw new ApiError(401, DEFAULT_MESSAGES[401]);
}

/** Realiza una solicitud a la API y devuelve el JSON de la respuesta. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const resolveBody = async () => (typeof body === 'function' ? await body() : body);

  const accessToken = auth ? await getAccessToken() : null;
  let response = await rawFetch(path, buildInit(method, await resolveBody(), accessToken));

  if (auth && response.status === 401) {
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch (error) {
      // Sin conexión no es lo mismo que sesión inválida: no se cierra la sesión.
      if (error instanceof ApiError && error.status === 0) {
        throw error;
      }
      return expireSession();
    }
    response = await rawFetch(path, buildInit(method, await resolveBody(), newToken));
    if (response.status === 401) {
      return expireSession();
    }
  }

  const data = await readJson(response);
  if (!response.ok) {
    throw toApiError(response, data);
  }
  return data as T;
}
