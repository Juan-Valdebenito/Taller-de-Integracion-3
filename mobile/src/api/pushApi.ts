/** Teléfono de la cuenta con sesión para notificaciones push (backend-go /me/push-token). */
import { apiRequest } from './client';

export type PushPlatform = 'ios' | 'android';

/** Registra el token de Expo Push del teléfono (idempotente). */
export async function registerPushToken(token: string, platform: PushPlatform): Promise<void> {
  await apiRequest('/me/push-token', { method: 'PUT', body: { token, platform } });
}

/** Deja de enviar notificaciones a este teléfono. */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiRequest('/me/push-token', { method: 'DELETE', body: { token } });
}
