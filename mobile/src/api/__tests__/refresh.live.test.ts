import { getCurrentUser, login } from '../../api/authApi';
import { getTokens, saveTokens } from '../../storage/tokenStorage';
import {
  describeLive,
  rawMe,
  rawRefresh,
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

  it('varias solicitudes simultáneas con el token vencido terminan bien con un solo refresh', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await signInWithReactiveRenewalOnly();
    const expired = (await getTokens())!;
    await waitForAccessTokenExpiry();

    const recorder = recordRequests();
    let users;
    try {
      users = await Promise.all([getCurrentUser(), getCurrentUser(), getCurrentUser()]);
    } finally {
      recorder.stop();
    }

    expect(users.map((u) => u.email)).toEqual([SEED_PASSENGER.email, SEED_PASSENGER.email, SEED_PASSENGER.email]);
    const count = (path: string, status: number) => recorder.calls.filter((c) => c.path === path && c.status === status).length;
    // backend-go rota el refresh token: un segundo refresh con el mismo token
    // habría respondido 401 y cerrado la sesión.
    expect(count('/auth/refresh', 200)).toBe(1);
    expect(recorder.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    expect(count('/auth/me', 401)).toBe(3);
    expect(count('/auth/me', 200)).toBe(3);
    const renewed = (await getTokens())!;
    const retries = recorder.calls.filter((c) => c.path === '/auth/me' && c.status === 200);
    expect(new Set(retries.map((c) => c.authorization))).toEqual(new Set([`Bearer ${renewed.accessToken}`]));
    expect(renewed.accessToken).not.toBe(expired.accessToken);
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

// Rotación: cada refresh token sirve una sola vez en backend-go.
describeLive('rotación del refresh token en backend-go real', () => {
  it('después de renovar, backend-go rechaza el refresh token anterior', async () => {
    await login(SEED_PASSENGER);
    const before = (await getTokens())!;

    await refreshAccessToken();

    const response = await rawRefresh(before.refreshToken);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Refresh token ya utilizado o revocado' });
    // La app sigue funcionando con el par nuevo.
    await expect(getCurrentUser()).resolves.toMatchObject({ email: SEED_PASSENGER.email });
  });

  it('si la app tiene un refresh token ya usado, cierra la sesión al necesitar renovar', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await signInWithReactiveRenewalOnly();
    const stale = (await getTokens())!;
    // Otro refresh lo consume (ej. una copia vieja de los tokens que se restauró).
    await refreshAccessToken();
    await saveTokens(stale);
    await waitForAccessTokenExpiry();

    const recorder = recordRequests();
    try {
      await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
    } finally {
      recorder.stop();
    }

    expect(recorder.calls.map(({ path, status }) => `${path} ${status}`)).toEqual(['/auth/me 401', '/auth/refresh 401']);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });
});
