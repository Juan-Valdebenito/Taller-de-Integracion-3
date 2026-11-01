import { getCurrentUser, login, logout } from '../../api/authApi';
import { getTokens } from '../../storage/tokenStorage';
import {
  describeLive,
  rawLogout,
  rawMe,
  rawRefresh,
  recordRequests,
  resetSecureStore,
  SEED_PASSENGER,
  waitForAccessTokenExpiry,
} from '../../test-utils/live/backend';
import { isProactiveRenewalEnabled, refreshAccessToken, setSessionExpiredHandler } from '../interceptor';

// Revocación contra backend-go real: tokens en la lista negra (logout desde
// otro dispositivo) y logout con el access token ya vencido.

const flow = (calls: Array<{ path: string; status: number }>) => calls.map(({ path, status }) => `${path} ${status}`);

/** Inicia sesión con la renovación anticipada apagada (como en refresh.live.test.ts). */
async function signInWithReactiveRenewalOnly() {
  await login(SEED_PASSENGER);
  await refreshAccessToken();
  expect(isProactiveRenewalEnabled()).toBe(false);
}

beforeEach(() => {
  resetSecureStore();
  setSessionExpiredHandler(null);
});

describeLive('revocación de tokens en backend-go real', () => {
  it('si la sesión se cierra desde otro dispositivo, la próxima solicitud cierra la sesión en la app', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await signInWithReactiveRenewalOnly();
    const tokens = (await getTokens())!;
    // Otro dispositivo con la misma sesión la cierra: backend-go revoca ambos.
    expect((await rawLogout(tokens)).status).toBe(200);

    const recorder = recordRequests();
    try {
      await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
    } finally {
      recorder.stop();
    }

    // El access token no venció, pero está en la lista negra; el refresh token
    // también, así que no hay cómo renovar.
    expect(flow(recorder.calls)).toEqual(['/auth/me 401', '/auth/refresh 401']);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('cerrar sesión con el access token vencido renueva, revoca el par NUEVO y lo confirma', async () => {
    await signInWithReactiveRenewalOnly();
    const expired = (await getTokens())!;
    await waitForAccessTokenExpiry();

    const recorder = recordRequests();
    let result;
    try {
      result = await logout();
    } finally {
      recorder.stop();
    }

    expect(result).toEqual({ serverConfirmed: true });
    expect(flow(recorder.calls)).toEqual(['/auth/logout 401', '/auth/refresh 200', '/auth/logout 200']);
    await expect(getTokens()).resolves.toBeNull();
    // El reintento envió el par que entregó el refresh, no el que este consumió.
    const retry = recorder.calls[2];
    const renewed = {
      accessToken: retry.authorization!.replace('Bearer ', ''),
      refreshToken: (retry.body as { refreshToken: string }).refreshToken,
    };
    expect(recorder.calls[0].body).toEqual({ refreshToken: expired.refreshToken });
    expect(renewed.refreshToken).not.toBe(expired.refreshToken);
    // Y backend-go dejó de aceptar ese par aunque el access token aún no vence.
    expect((await rawMe(renewed.accessToken)).status).toBe(401);
    expect((await rawRefresh(renewed.refreshToken)).status).toBe(401);
  });

  it('cerrar sesión con tokens ya revocados en otro dispositivo cuenta como confirmado', async () => {
    await signInWithReactiveRenewalOnly();
    expect((await rawLogout((await getTokens())!)).status).toBe(200);

    // No queda nada que revocar en el servidor.
    await expect(logout()).resolves.toEqual({ serverConfirmed: true });
    await expect(getTokens()).resolves.toBeNull();
  });
});
