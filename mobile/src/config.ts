/**
 * Configuración de la app móvil.
 *
 * EXPO_PUBLIC_API_URL se define en mobile/.env (ver .env.example). Expo la
 * incrusta al compilar, por eso debe empezar con EXPO_PUBLIC_.
 */
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';

/** URL base de la API REST de backend-go (sin "/" final), ej. https://host/api/v1 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

/** Tiempo máximo de espera de cada solicitud HTTP. */
export const REQUEST_TIMEOUT_MS = 15_000;
