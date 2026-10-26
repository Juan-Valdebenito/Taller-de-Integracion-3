/**
 * Cliente JSON de la API de backend-go.
 *
 * Las solicitudes autenticadas pasan por el interceptor (./interceptor): agrega
 * el access token y, ante un 401, lo renueva en POST /auth/refresh y reintenta.
 * Aquí solo se arma el cuerpo JSON y se traduce la respuesta.
 */
import { readJson, toApiError } from './errors';
import { authFetch } from './interceptor';

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

function buildInit(method: string, body: unknown): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

/** Realiza una solicitud a la API y devuelve el JSON de la respuesta. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const response = await authFetch(
    path,
    async () => buildInit(method, typeof body === 'function' ? await body() : body),
    { auth },
  );

  const data = await readJson(response);
  if (!response.ok) {
    throw toApiError(response, data);
  }
  return data as T;
}
