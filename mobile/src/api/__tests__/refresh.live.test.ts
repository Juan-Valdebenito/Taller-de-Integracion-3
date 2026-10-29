import { getCurrentUser, login } from '../../api/authApi';
import { getTokens } from '../../storage/tokenStorage';
import {
  describeLive,
  rawMe,
  recordRequests,
  resetSecureStore,
  SEED_PASSENGER,
  waitForAccessTokenExpiry,
} from '../../test-utils/live/backend';
import { isProactiveRenewalEnabled, refreshAccessToken, setSessionExpiredHandler } from '../interceptor';

// Flujo del 401 contra backend-go real: el access token vence de verdad, la
// solicitud recibe 401, el interceptor renueva en /auth/refresh y reintenta.

/**
 * Inicia sesión y deja la renovación anticipada apagada como en un teléfono:
 * un refresh real entrega otro token de pocos segundos, que ya aparece "por
 * vencer" (protección de la tarea 4). Así se prueba el camino del 401.
 */
async function signInWithReactiveRenewalOnly() {
  await login(SEED_PASSENGER);
  await refreshAccessToken();
  expect(isProactiveRenewalEnabled()).toBe(false);
}

beforeEach(() => {
  resetSecureStore();
  setSessionExpiredHandler(null);
});

describeLive('renovación ante un 401 de backend-go real', () => {
  it('con el access token vencido, recibe 401, renueva y la solicitud termina bien', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await signInWithReactiveRenewalOnly();
    const expired = (await getTokens())!;
    await waitForAccessTokenExpiry();
    // backend-go ya no acepta ese token.
    expect((await rawMe(expired.accessToken)).status).toBe(401);

    const recorder = recordRequests();
    try {
      await expect(getCurrentUser()).resolves.toMatchObject({ email: SEED_PASSENGER.email });
    } finally {
      recorder.stop();
    }

    expect(recorder.calls.map(({ path, status }) => `${path} ${status}`)).toEqual([
      '/auth/me 401',
      '/auth/refresh 200',
      '/auth/me 200',
    ]);
    const renewed = (await getTokens())!;
    expect(recorder.calls[0].authorization).toBe(`Bearer ${expired.accessToken}`);
    expect(recorder.calls[2].authorization).toBe(`Bearer ${renewed.accessToken}`);
    // backend-go rotó los dos tokens.
    expect(renewed.accessToken).not.toBe(expired.accessToken);
    expect(renewed.refreshToken).not.toBe(expired.refreshToken);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('después de renovar, las solicitudes siguientes usan el token nuevo sin otro refresh', async () => {
    await signInWithReactiveRenewalOnly();
    await waitForAccessTokenExpiry();
    await getCurrentUser();

    const recorder = recordRequests();
    try {
      await getCurrentUser();
    } finally {
      recorder.stop();
    }

    expect(recorder.calls.map(({ path, status }) => `${path} ${status}`)).toEqual(['/auth/me 200']);
  });
});
