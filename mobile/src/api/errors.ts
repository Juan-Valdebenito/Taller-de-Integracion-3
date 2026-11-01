/**
 * Errores de la API de backend-go con mensajes listos para mostrar al usuario.
 */

/** Error de la API con un mensaje listo para mostrar al usuario. */
export class ApiError extends Error {
  /** Código HTTP; 0 si no hubo respuesta (sin conexión o timeout). */
  readonly status: number;
  /** Segundos de espera sugeridos por el servidor en respuestas 429. */
  readonly retryAfter?: number;
  /** Errores de validación por campo (ej. { password: "..." }) en respuestas 400. */
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, retryAfter?: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.fieldErrors = fieldErrors;
  }
}

export const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión expiró. Inicia sesión nuevamente.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró el recurso solicitado.',
  409: 'El recurso ya existe.',
  429: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  500: 'Error del servidor. Inténtalo más tarde.',
  503: 'El servicio no está disponible en este momento.',
};

/** Lee el cuerpo como JSON; null si viene vacío o no es JSON. */
export async function readJson(response: Response): Promise<any> {
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

/**
 * backend-go responde errores en dos formatos:
 *   { "error": "..." }                                         (la mayoría)
 *   { "message": "...", "errors": [{ "field", "message" }] }   (validación de registro)
 */
export function toApiError(response: Response, data: any): ApiError {
  const retryAfterHeader = Number(response.headers.get('Retry-After'));
  const retryAfter =
    typeof data?.retryAfter === 'number' ? data.retryAfter : Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;

  let fieldErrors: Record<string, string> | undefined;
  if (Array.isArray(data?.errors)) {
    fieldErrors = {};
    for (const item of data.errors) {
      if (typeof item?.field === 'string' && typeof item?.message === 'string' && !(item.field in fieldErrors)) {
        fieldErrors[item.field] = item.message;
      }
    }
  }
  const firstFieldError = fieldErrors ? Object.values(fieldErrors)[0] : undefined;

  const message =
    (typeof data?.error === 'string' && data.error) ||
    firstFieldError ||
    (typeof data?.message === 'string' && data.message) ||
    DEFAULT_MESSAGES[response.status] ||
    `Error inesperado (${response.status}).`;
  return new ApiError(response.status, message, retryAfter, fieldErrors);
}
