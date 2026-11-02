import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_PASSENGER } from '../../test-utils/live/backend';
import { apiRequest } from '../client';
import { registerPushToken, unregisterPushToken } from '../pushApi';

// Registro del teléfono para notificaciones push contra backend-go real.

beforeEach(() => {
  resetSecureStore();
});

const token = (name: string) => `ExponentPushToken[${name}${Date.now()}]`;

describeLive('tokens de notificaciones push en backend-go real', () => {
  it('sin sesión no se registra ningún teléfono', async () => {
    await expect(apiRequest('/me/push-token', { method: 'PUT', auth: false, body: { token: token('anonimo'), platform: 'android' } })).rejects.toMatchObject({ status: 401 });
  });

  it('cualquier cuenta registra y quita su teléfono; un token inválido se rechaza', async () => {
    const phone = token('telefono');
    for (const account of [SEED_PASSENGER, SEED_COMPANY]) {
      await login(account);
      try {
        await expect(registerPushToken(phone, 'android')).resolves.toBeUndefined();
        // Registrar de nuevo es idempotente (el mismo teléfono con otra cuenta pasa a esa cuenta).
        await expect(registerPushToken(phone, 'ios')).resolves.toBeUndefined();
        await expect(apiRequest('/me/push-token', { method: 'PUT', body: { token: 'no-es-un-token', platform: 'android' } })).rejects.toMatchObject({ status: 400 });
        await expect(apiRequest('/me/push-token', { method: 'PUT', body: { token: phone, platform: 'web' } })).rejects.toMatchObject({ status: 400 });
      } finally {
        await logout();
      }
    }

    await login(SEED_COMPANY);
    try {
      await expect(unregisterPushToken(phone)).resolves.toBeUndefined();
      // Quitar uno que ya no está también responde bien.
      await expect(apiRequest('/me/push-token', { method: 'DELETE', body: { token: phone } })).resolves.toBeNull();
    } finally {
      await logout();
    }
  });
});
