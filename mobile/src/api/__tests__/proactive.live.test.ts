import { getCurrentUser, login } from '../../api/authApi';
import { getTokenExpiry } from '../../auth/jwt';
import { getTokens } from '../../storage/tokenStorage';
import { describeLive, rawRefresh, recordRequests, resetSecureStore, SEED_PASSENGER } from '../../test-utils/live/backend';
import { isProactiveRenewalEnabled, resetProactiveRenewal, setSessionExpiredHandler } from '../interceptor';

// Renovación anticipada contra backend-go real. El backend de prueba emite
// access tokens de pocos segundos, menos que el margen de 1 minuto: recién
// iniciada la sesión el token ya está "por vencer", así que la primera
// solicitud renueva antes de enviarse. El token nuevo también es corto, y la
// protección contra un reloj desajustado apaga la renovación anticipada.

const flow = (calls: Array<{ path: string; status: number }>) => calls.map(({ path, status }) => `${path} ${status}`);

beforeEach(() => {
  resetSecureStore();
  setSessionExpiredHandler(null);
  // Como al abrir la app: la renovación anticipada parte activa.
  resetProactiveRenewal();
});

describeLive('renovación anticipada contra backend-go real', () => {
  it('con el token por vencer, renueva antes de enviar y la solicitud no recibe 401', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    await login(SEED_PASSENGER);
    const before = (await getTokens())!;
    // Sigue vigente en backend-go: no hay 401 que esperar.
    expect(getTokenExpiry(before.accessToken)!).toBeGreaterThan(Date.now());

    const recorder = recordRequests();
    try {
      await expect(getCurrentUser()).resolves.toMatchObject({ email: SEED_PASSENGER.email });
    } finally {
      recorder.stop();
    }

    expect(flow(recorder.calls)).toEqual(['/auth/refresh 200', '/auth/me 200']);
    const renewed = (await getTokens())!;
    expect(recorder.calls[1].authorization).toBe(`Bearer ${renewed.accessToken}`);
    expect(renewed.refreshToken).not.toBe(before.refreshToken);
    // La rotación es real: el refresh token anterior ya no sirve.
    expect((await rawRefresh(before.refreshToken)).status).toBe(401);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('si el token nuevo también parece por vencer, deja de renovar antes de cada solicitud', async () => {
    await login(SEED_PASSENGER);
    await getCurrentUser();
    expect(isProactiveRenewalEnabled()).toBe(false);

    const recorder = recordRequests();
    try {
      await getCurrentUser();
      await getCurrentUser();
    } finally {
      recorder.stop();
    }

    // Sin la protección habría un /auth/refresh antes de cada /auth/me.
    expect(flow(recorder.calls)).toEqual(['/auth/me 200', '/auth/me 200']);
  });

  it('con solicitudes simultáneas y el token por vencer, renueva una sola vez', async () => {
    await login(SEED_PASSENGER);

    const recorder = recordRequests();
    try {
      await Promise.all([getCurrentUser(), getCurrentUser(), getCurrentUser()]);
    } finally {
      recorder.stop();
    }

    expect(recorder.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    expect(flow(recorder.calls).filter((c) => c === '/auth/me 200')).toHaveLength(3);
    expect(recorder.calls.some((c) => c.status === 401)).toBe(false);
  });
});
