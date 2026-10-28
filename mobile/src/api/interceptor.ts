/**
 * Interceptor HTTP global de las solicitudes autenticadas a backend-go.
 *
 * - Agrega "Authorization: Bearer <accessToken>".
 * - Si la respuesta es 401 (access token vencido, ~15 min), pide un par nuevo
 *   en POST /auth/refresh (rotación de tokens) y reintenta UNA vez.
 * - Las renovaciones simultáneas comparten una sola llamada: backend-go rota el
 *   refresh token (cada uno sirve una vez), así que dos refresh en paralelo
 *   invalidarían la sesión.
 * - Si el 401 llega cuando otra solicitud ya renovó (el token guardado no es el
 *   que se envió), reintenta con el guardado sin pedir otro refresh: cada
 *   refresh rota los tokens y cuenta para el límite de backend-go (tokenForRetry).
 * - Solo cierra la sesión (borra los tokens y avisa con onSessionExpired) si el
 *   refresh token ya no sirve: refresh con 401/400, o el reintento con el token
 *   nuevo da 401. Con una falla pasajera (sin conexión, 429, 5xx) conserva los
 *   tokens y entrega ese error (isSessionInvalid).
 *
 * Trabaja con Response y RequestInit, sin asumir JSON: sirve también para
 * subir archivos (FormData) o descargar imágenes.
 */
import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import type { AuthResponse } from '../auth/types';
import { getTokenExpiry, isExpiringSoon } from '../auth/jwt';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../storage/tokenStorage';
import { ApiError, DEFAULT_MESSAGES, readJson, toApiError } from './errors';

/**
 * Opciones de la solicitud. Puede ser una función: se evalúa en cada intento,
 * para que el reintento tras renovar tokens envíe un cuerpo nuevo (un FormData
 * o un body con el refresh token actualizado).
 */
export type RequestInitSource = RequestInit | (() => RequestInit | Promise<RequestInit>);

export interface AuthFetchOptions {
  /** Enviar el access token y renovarlo si venció. Por defecto true. */
  auth?: boolean;
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

/** Registra quién reacciona cuando la sesión ya no se puede renovar (ej. volver al login). */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

/** fetch a la API con timeout; un fallo de red se traduce a ApiError(0). */
export async function rawFetch(path: string, init: RequestInit): Promise<Response> {
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

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  if (typeof (headers as Headers).forEach === 'function') {
    const record: Record<string, string> = {};
    (headers as Headers).forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return { ...(headers as Record<string, string>) };
}

function withAccessToken(init: RequestInit, accessToken: string | null): RequestInit {
  if (!accessToken) {
    return init;
  }
  return { ...init, headers: { ...headersToRecord(init.headers), Authorization: `Bearer ${accessToken}` } };
}

/**
 * Indica si un fallo de POST /auth/refresh significa que la sesión ya no sirve.
 *
 * backend-go responde 401 si el refresh token es inválido, venció o ya se usó,
 * y 400 si no se envió: en esos casos hay que volver al login. Un 429 (límite
 * de intentos), un 5xx (ej. 503 si no puede consultar la lista de revocados) o
 * la falta de conexión son pasajeros: el refresh token no se consumió y sigue
 * sirviendo, así que no se cierra la sesión.
 */
export function isSessionInvalid(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 400);
}

export const INVALID_REFRESH_RESPONSE = 'El servidor respondió de forma inesperada. Inténtalo más tarde.';

function hasTokenPair(data: unknown): data is Pick<AuthResponse, 'accessToken' | 'refreshToken'> {
  const tokens = data as Partial<AuthResponse> | null;
  return (
    typeof tokens?.accessToken === 'string' &&
    tokens.accessToken !== '' &&
    typeof tokens.refreshToken === 'string' &&
    tokens.refreshToken !== ''
  );
}

let refreshInFlight: Promise<string> | null = null;

/**
 * Renovación anticipada activa. Se desactiva si un token recién emitido ya
 * aparece "por vencer": el reloj del teléfono está adelantado (o el backend
 * emite tokens más cortos que el margen) y se pediría un refresh antes de cada
 * solicitud. Sin ella se renueva ante el 401, que no depende del reloj. Se
 * vuelve a activar cuando un refresh entrega un token con tiempo normal.
 */
let proactiveRenewal = true;

/** Indica si se está renovando antes de tiempo (false si el reloj no es confiable). */
export function isProactiveRenewalEnabled(): boolean {
  return proactiveRenewal;
}

/** Vuelve a activar la renovación anticipada (para pruebas). */
export function resetProactiveRenewal(): void {
  proactiveRenewal = true;
}

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
      const response = await rawFetch('/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw toApiError(response, data);
      }
      if (!hasTokenPair(data)) {
        // Un 200 sin tokens (cuerpo vacío o cortado por un proxy) es una falla
        // del servidor: no se guarda nada y la sesión se conserva (no es 401/400).
        throw new ApiError(502, INVALID_REFRESH_RESPONSE);
      }
      await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      proactiveRenewal = !isExpiringSoon(data.accessToken);
      return data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Access token para reintentar una solicitud que dio 401 con `sentToken`.
 *
 * Si el guardado ya no es el que se envió, otra solicitud lo renovó mientras
 * esta esperaba su respuesta: se reintenta con ese, sin pedir otro refresh
 * (cada refresh rota los tokens y cuenta para el límite de backend-go). Si es
 * el mismo, se renueva; una renovación en curso se comparte.
 */
async function tokenForRetry(sentToken: string | null): Promise<string> {
  const current = await getAccessToken();
  if (current && current !== sentToken) {
    return current;
  }
  return refreshAccessToken();
}

/**
 * Renueva antes de enviar si el access token vence pronto (según su "exp"),
 * para no gastar una solicitud en un 401. Devuelve el token con que enviar.
 *
 * Si el refresh falla por algo pasajero y el token todavía no vence, se envía
 * igual con él; si ya venció, la solicitud daría 401 con seguridad, así que se
 * entrega el error sin enviarla.
 */
async function renewAhead(accessToken: string): Promise<string> {
  if (!proactiveRenewal || !isExpiringSoon(accessToken)) {
    return accessToken;
  }
  try {
    return await refreshAccessToken();
  } catch (error) {
    if (isSessionInvalid(error)) {
      return expireSession();
    }
    const expiry = getTokenExpiry(accessToken);
    if (expiry !== null && expiry <= Date.now()) {
      throw error;
    }
    return accessToken;
  }
}

async function expireSession(): Promise<never> {
  await clearTokens();
  onSessionExpired?.();
  throw new ApiError(401, DEFAULT_MESSAGES[401]);
}

/**
 * fetch a la API pasando por el interceptor. Devuelve la Response tal cual
 * (también si es un error distinto de 401): quien llama decide cómo leerla.
 */
export async function authFetch(path: string, init: RequestInitSource = {}, options: AuthFetchOptions = {}): Promise<Response> {
  const { auth = true } = options;
  const resolveInit = async () => (typeof init === 'function' ? await init() : init);

  const storedToken = auth ? await getAccessToken() : null;
  const accessToken = storedToken ? await renewAhead(storedToken) : null;
  const response = await rawFetch(path, withAccessToken(await resolveInit(), accessToken));
  if (!auth || response.status !== 401) {
    return response;
  }
  // Si se envió con un token recién renovado y aun así da 401, renovar otra vez
  // no sirve: igual que cuando el reintento tras renovar da 401.
  if (accessToken !== storedToken) {
    return expireSession();
  }

  let newToken: string;
  try {
    newToken = await tokenForRetry(accessToken);
  } catch (error) {
    // Solo se cierra la sesión si el refresh token ya no sirve. Con una falla
    // pasajera (sin conexión, 429, 5xx) se conservan los tokens y quien llama
    // recibe ese error, con su mensaje, para reintentar más tarde.
    if (isSessionInvalid(error)) {
      return expireSession();
    }
    throw error;
  }
  const retried = await rawFetch(path, withAccessToken(await resolveInit(), newToken));
  if (retried.status === 401) {
    return expireSession();
  }
  return retried;
}
