import { getCurrentUser, login, logout } from '../../api/authApi';
import { ApiError } from '../../api/errors';
import { getTokens } from '../../storage/tokenStorage';
import { ACCESS_TTL_SECONDS, describeLive, rawMe, resetSecureStore, SEED_PASSENGER } from '../../test-utils/live/backend';
import { getTokenExpiry } from '../jwt';

// Sesión contra backend-go real: login, GET /auth/me y logout (lista negra).

beforeEach(() => {
  resetSecureStore();
});

describeLive('sesión contra backend-go real', () => {
  it('inicia sesión con el pasajero del seed y guarda tokens que backend-go firmó', async () => {
    const before = Date.now();
    const user = await login(SEED_PASSENGER);

    expect(user).toMatchObject({ email: SEED_PASSENGER.email, role: 'PASSENGER' });
    const tokens = await getTokens();
    expect(tokens).not.toBeNull();
    expect(tokens!.accessToken).not.toBe(tokens!.refreshToken);
    // El access token dura lo que se configuró al levantar el backend.
    const expiry = getTokenExpiry(tokens!.accessToken);
    expect(expiry).not.toBeNull();
    expect(expiry! - before).toBeGreaterThan(0);
    expect(expiry! - before).toBeLessThanOrEqual((ACCESS_TTL_SECONDS + 2) * 1000);
  });

  it('con una contraseña incorrecta responde 401 y no guarda nada', async () => {
    await expect(login({ ...SEED_PASSENGER, password: 'incorrecta' })).rejects.toMatchObject({
      status: 401,
      message: 'Credenciales inválidas',
    });
    await expect(getTokens()).resolves.toBeNull();
  });

  it('GET /auth/me devuelve el usuario de la sesión', async () => {
    await login(SEED_PASSENGER);

    await expect(getCurrentUser()).resolves.toMatchObject({ email: SEED_PASSENGER.email, role: 'PASSENGER' });
  });

  it('cerrar sesión borra los tokens y backend-go deja de aceptar el access token', async () => {
    await login(SEED_PASSENGER);
    // Con tokens de pocos segundos la primera solicitud puede renovar antes de
    // tiempo: se toma el token que quedó después, que es el que logout revoca.
    await getCurrentUser();
    const { accessToken } = (await getTokens())!;
    expect((await rawMe(accessToken)).status).toBe(200);

    await expect(logout()).resolves.toEqual({ serverConfirmed: true });

    await expect(getTokens()).resolves.toBeNull();
    // El token aún no vence, pero quedó en la lista negra.
    expect((await rawMe(accessToken)).status).toBe(401);
    await expect(getCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});
