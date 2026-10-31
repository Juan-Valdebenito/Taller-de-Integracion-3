import * as SecureStore from 'expo-secure-store';

import { clearTokens, getTokens, saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { accessTokenExpiringIn } from '../../test-utils/jwt';
import { ApiError, DEFAULT_MESSAGES } from '../errors';
import {
  authFetch,
  INVALID_REFRESH_RESPONSE,
  isProactiveRenewalEnabled,
  isSessionInvalid,
  refreshAccessToken,
  renewIfExpiringSoon,
  resetProactiveRenewal,
  setSessionExpiredHandler,
} from '../interceptor';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  setSessionExpiredHandler(null);
  resetProactiveRenewal();
  await saveTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });
});

const refreshed = fakeResponse({
  body: { accessToken: 'access-new', refreshToken: 'refresh-new', user: { id: '1' } },
});

const headersOf = (call: number) => fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>;

const refreshCalls = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh')).length;

/** Authorization de cada llamada a `path`, en orden. */
const authsTo = (path: string) =>
  fetchMock.mock.calls
    .filter(([url]) => url.endsWith(path))
    .map(([, init]) => (init?.headers as Record<string, string> | undefined)?.Authorization);

/**
 * Respuesta que el test entrega cuando quiere, para simular un 401 que llega
 * tarde. `sent` se cumple cuando la solicitud ya salió (con el token de ese momento).
 */
function heldResponse() {
  let markSent!: () => void;
  let deliver!: (response: Response) => void;
  const sent = new Promise<void>((resolve) => (markSent = resolve));
  return {
    sent,
    respond: () => {
      markSent();
      return new Promise<Response>((resolve) => (deliver = resolve));
    },
    answer: (response: Response) => deliver(response),
  };
}

describe('authFetch', () => {
  it('devuelve la respuesta sin leerla, también si es un error distinto de 401', async () => {
    const notFound = fakeResponse({ status: 404, body: { error: 'Reclamo no encontrado' } });
    fetchMock.mockResolvedValueOnce(notFound);

    await expect(authFetch('/complaints/x')).resolves.toBe(notFound);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envía un FormData tal cual, sin forzar Content-Type, y lo arma de nuevo al reintentar', async () => {
    const forms: FormData[] = [];
    const makeInit = jest.fn(() => {
      const form = new FormData();
      form.append('maskRegions', '[]');
      forms.push(form);
      return { method: 'POST', body: form };
    });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ status: 201, body: { id: 'img-1' } }));

    const response = await authFetch('/complaints/c1/attachments', makeInit);

    expect(response.status).toBe(201);
    expect(makeInit).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(forms[0]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(forms[1]);
    expect(forms[0]).not.toBe(forms[1]);
    // fetch pone el boundary del multipart solo si no hay Content-Type.
    expect(headersOf(2)).toEqual({ Authorization: 'Bearer access-new' });
  });

  it.each([
    ['objeto', { Accept: 'image/*' }],
    ['arreglo', [['Accept', 'image/*']]],
  ])('conserva los encabezados de quien llama (%s) y agrega Authorization', async (_kind, headers) => {
    fetchMock.mockResolvedValueOnce(fakeResponse());

    await authFetch('/complaints/c1/attachments/a1/file', { headers: headers as HeadersInit });

    expect(headersOf(0)).toEqual({ Accept: 'image/*', Authorization: 'Bearer access-old' });
  });

  it('conserva los encabezados de un objeto Headers', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse());
    const headers = new Headers({ Accept: 'image/*' });

    await authFetch('/complaints/c1/attachments/a1/file', { headers });

    // Headers guarda los nombres en minúscula.
    expect(headersOf(0)).toEqual({ accept: 'image/*', Authorization: 'Bearer access-old' });
  });

  it('no modifica las opciones que recibe', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse());
    const init = { method: 'GET', headers: { Accept: 'application/json' } };

    await authFetch('/auth/me', init);

    expect(init).toEqual({ method: 'GET', headers: { Accept: 'application/json' } });
  });

  it('sin autenticación no envía token ni intenta renovar ante un 401', async () => {
    const unauthorized = fakeResponse({ status: 401, body: { error: 'Credenciales inválidas' } });
    fetchMock.mockResolvedValueOnce(unauthorized);

    await expect(authFetch('/auth/login', { method: 'POST' }, { auth: false })).resolves.toBe(unauthorized);
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin tokens guardados no envía Authorization y cierra la sesión ante un 401', async () => {
    await clearTokens();
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401 }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
    // Sin refresh token no hay nada que renovar: no se llama a /auth/refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('si el reintento con el token nuevo también da 401, cierra la sesión', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ status: 401 }));

    await expect(authFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('sin conexión al renovar propaga el error y conserva los tokens', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 0 });
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
  });

  it.each([
    ['vacío', undefined],
    ['sin refresh token', { accessToken: 'access-new' }],
    ['con tokens vacíos', { accessToken: '', refreshToken: '' }],
    ['con tokens que no son texto', { accessToken: 123, refreshToken: null }],
  ])('si el refresh responde 200 con un cuerpo %s, no guarda nada y conserva la sesión', async (_kind, body) => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 502, message: INVALID_REFRESH_RESPONSE });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
  });
});

// La respuesta 401 de una solicitud llega después de que otra ya renovó los
// tokens: se reintenta con el token guardado, sin otro refresh (tarea 3).
describe('authFetch con respuestas 401 tardías', () => {
  /**
   * backend-go simulado. El primer intento a cada ruta de `held` queda esperando
   * hasta que el test lo responde; el resto acepta solo los tokens válidos.
   * `refresh` da la respuesta de cada llamada a /auth/refresh.
   */
  function backend(
    held: Record<string, ReturnType<typeof heldResponse>>,
    {
      isValid = (auth?: string) => auth === 'Bearer access-new',
      refresh = () => refreshed,
    }: { isValid?: (auth?: string) => boolean; refresh?: () => Response } = {},
  ) {
    const waiting = { ...held };
    fetchMock.mockImplementation(async (url, init) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (url.endsWith('/auth/refresh')) return refresh();
      const path = Object.keys(waiting).find((p) => url.endsWith(p));
      if (path) {
        delete waiting[path];
        return held[path].respond();
      }
      return isValid(auth) ? fakeResponse({ body: { ok: true } }) : fakeResponse({ status: 401 });
    });
  }

  it('reintenta con el token nuevo sin otro refresh', async () => {
    const slow = heldResponse();
    backend({ '/lenta': slow });

    const pending = authFetch('/lenta');
    await slow.sent;
    await expect(authFetch('/rapida')).resolves.toMatchObject({ status: 200 });
    slow.answer(fakeResponse({ status: 401 }));

    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(refreshCalls()).toBe(1);
    expect(authsTo('/lenta')).toEqual(['Bearer access-old', 'Bearer access-new']);
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it('con varias respuestas tardías sigue habiendo un solo refresh', async () => {
    const held = { '/lenta-1': heldResponse(), '/lenta-2': heldResponse(), '/lenta-3': heldResponse() };
    backend(held);

    const pending = Object.keys(held).map((path) => authFetch(path));
    await Promise.all(Object.values(held).map((h) => h.sent));
    await expect(authFetch('/rapida')).resolves.toMatchObject({ status: 200 });
    // Llegan en otro orden que el de salida.
    for (const path of ['/lenta-2', '/lenta-3', '/lenta-1'] as const) {
      held[path].answer(fakeResponse({ status: 401 }));
    }

    const responses = await Promise.all(pending);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls()).toBe(1);
    for (const path of Object.keys(held)) {
      expect(authsTo(path)).toEqual(['Bearer access-old', 'Bearer access-new']);
    }
  });

  it('si el token ya renovado también da 401, cierra la sesión sin pedir otro refresh', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    const slow = heldResponse();
    let newTokenRevoked = false;
    backend({ '/lenta': slow }, { isValid: (auth) => auth === 'Bearer access-new' && !newTokenRevoked });

    const pending = authFetch('/lenta');
    await slow.sent;
    await expect(authFetch('/rapida')).resolves.toMatchObject({ status: 200 });
    // Ej. se cerró la sesión desde otro dispositivo: backend-go revocó el par nuevo.
    newTokenRevoked = true;
    slow.answer(fakeResponse({ status: 401 }));

    await expect(pending).rejects.toMatchObject({ status: 401, message: DEFAULT_MESSAGES[401] });
    expect(refreshCalls()).toBe(1);
    expect(authsTo('/lenta')).toEqual(['Bearer access-old', 'Bearer access-new']);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });
  it('una solicitud que salió sin token reintenta con el que se guardó mientras tanto', async () => {
    await clearTokens();
    const slow = heldResponse();
    backend({ '/lenta': slow });

    const pending = authFetch('/lenta');
    await slow.sent;
    // Mientras tanto se inicia sesión (login guarda un par nuevo).
    await saveTokens({ accessToken: 'access-new', refreshToken: 'refresh-new' });
    slow.answer(fakeResponse({ status: 401 }));

    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(authsTo('/lenta')).toEqual([undefined, 'Bearer access-new']);
    expect(refreshCalls()).toBe(0);
  });

  it('si la renovación de la otra solicitud falló, el 401 tardío vuelve a renovar', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    const slow = heldResponse();
    const refreshes = [fakeResponse({ status: 503 }), refreshed];
    backend({ '/lenta': slow }, { refresh: () => refreshes.shift()! });

    const pending = authFetch('/lenta');
    await slow.sent;
    await expect(authFetch('/rapida')).rejects.toMatchObject({ status: 503 });
    // Nadie renovó: el token guardado sigue siendo el que envió /lenta.
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
    slow.answer(fakeResponse({ status: 401 }));

    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(refreshCalls()).toBe(2);
    expect(bodyOf(fetchMock, fetchMock.mock.calls.findLastIndex(([url]) => url.endsWith('/auth/refresh')))).toEqual({
      refreshToken: 'refresh-old',
    });
    expect(authsTo('/lenta')).toEqual(['Bearer access-old', 'Bearer access-new']);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('si la sesión ya expiró, el 401 tardío no llama a /auth/refresh', async () => {
    const onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
    const slow = heldResponse();
    backend({ '/lenta': slow }, { refresh: () => fakeResponse({ status: 401, body: { error: 'Refresh token ya utilizado o revocado' } }) });

    const pending = authFetch('/lenta');
    await slow.sent;
    await expect(authFetch('/rapida')).rejects.toMatchObject({ status: 401 });
    await expect(getTokens()).resolves.toBeNull();
    slow.answer(fakeResponse({ status: 401 }));

    await expect(pending).rejects.toMatchObject({ status: 401, message: DEFAULT_MESSAGES[401] });
    // Sin tokens guardados no hay nada que renovar ni con qué reintentar.
    expect(refreshCalls()).toBe(1);
    expect(authsTo('/lenta')).toEqual(['Bearer access-old']);
    // Cada solicitud avisa al cerrar la sesión. Es inofensivo: AuthContext solo
    // deja el estado en "signedOut", y repetirlo no cambia nada.
    expect(onExpired).toHaveBeenCalledTimes(2);
  });
});

// Si el access token vence pronto (según su "exp"), se renueva antes de enviar
// la solicitud en vez de esperar el 401 (tarea 4).
describe('authFetch con renovación anticipada', () => {
  const urls = () => fetchMock.mock.calls.map(([url]) => url.replace(/^.*\/api\/v1/, ''));
  let onExpired: jest.Mock;

  beforeEach(() => {
    onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
  });

  async function storeAccessTokenExpiringIn(seconds: number) {
    const token = accessTokenExpiringIn(seconds);
    await saveTokens({ accessToken: token, refreshToken: 'refresh-old' });
    return token;
  }

  it('si el token vence pronto, renueva primero y envía una sola vez con el nuevo', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(refreshed).mockResolvedValueOnce(fakeResponse({ body: { id: '1' } }));

    await expect(authFetch('/auth/me')).resolves.toMatchObject({ status: 200 });

    expect(urls()).toEqual(['/auth/refresh', '/auth/me']);
    expect(bodyOf(fetchMock, 0)).toEqual({ refreshToken: 'refresh-old' });
    expect(authHeaderOf(fetchMock, 1)).toBe('Bearer access-new');
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it('si al token le queda tiempo, no renueva', async () => {
    const token = await storeAccessTokenExpiringIn(15 * 60);
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { id: '1' } }));

    await authFetch('/auth/me');

    expect(urls()).toEqual(['/auth/me']);
    expect(authHeaderOf(fetchMock, 0)).toBe(`Bearer ${token}`);
  });

  it('si el refresh falla por algo pasajero y el token todavía sirve, envía igual con él', async () => {
    const token = await storeAccessTokenExpiringIn(30);
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 503, body: { error: 'No se pudo verificar el estado del token, intenta nuevamente' } }))
      .mockResolvedValueOnce(fakeResponse({ body: { id: '1' } }));

    await expect(authFetch('/auth/me')).resolves.toMatchObject({ status: 200 });

    expect(urls()).toEqual(['/auth/refresh', '/auth/me']);
    expect(authHeaderOf(fetchMock, 1)).toBe(`Bearer ${token}`);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: token, refreshToken: 'refresh-old' });
  });

  it('si el refresh falla por algo pasajero y el token ya venció, entrega el error sin enviar la solicitud', async () => {
    const token = await storeAccessTokenExpiringIn(-10);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 429, body: { error: 'Demasiadas solicitudes.', retryAfter: 30 } }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 429, retryAfter: 30 });

    expect(urls()).toEqual(['/auth/refresh']);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: token, refreshToken: 'refresh-old' });
  });

  it('si el refresh dice que la sesión no sirve, la cierra sin enviar la solicitud', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Refresh token ya utilizado o revocado' } }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401, message: DEFAULT_MESSAGES[401] });

    expect(urls()).toEqual(['/auth/refresh']);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('con solicitudes simultáneas y el token por vencer, renueva una sola vez', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? refreshed : fakeResponse({ body: {} })));

    await Promise.all([authFetch('/a'), authFetch('/b'), authFetch('/c')]);

    expect(refreshCalls()).toBe(1);
    expect(['/a', '/b', '/c'].map((path) => authsTo(path))).toEqual([
      ['Bearer access-new'],
      ['Bearer access-new'],
      ['Bearer access-new'],
    ]);
  });

  it('si después de renovar igual da 401, cierra la sesión sin otro refresh', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(refreshed).mockResolvedValueOnce(fakeResponse({ status: 401 }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(urls()).toEqual(['/auth/refresh', '/auth/me']);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('sin autenticación no renueva aunque haya un token por vencer', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: {} }));

    await authFetch('/auth/login', { method: 'POST' }, { auth: false });

    expect(urls()).toEqual(['/auth/login']);
    expect(authHeaderOf(fetchMock, 0)).toBeUndefined();
  });
});

// Si el reloj del teléfono está adelantado, todo token parece vencido: renovar
// antes de tiempo pediría un refresh antes de cada solicitud. Se detecta porque
// un token recién emitido ya aparece "por vencer" y se vuelve al 401 (tarea 4).
describe('authFetch con el reloj del teléfono desajustado', () => {
  /** Respuesta de /auth/refresh con el access token dado. */
  const refreshedWith = (accessToken: string) =>
    fakeResponse({ body: { accessToken, refreshToken: 'refresh-new', user: { id: '1' } } });

  // Tokens de 15 min vistos con el reloj 20 min adelantado: vencieron hace 5 min.
  const AHEAD_TOKEN_SECONDS = 15 * 60 - 20 * 60;

  it('si el token recién renovado ya parece vencido, deja de renovar antes de cada solicitud', async () => {
    await saveTokens({ accessToken: accessTokenExpiringIn(AHEAD_TOKEN_SECONDS), refreshToken: 'refresh-old' });
    const fresh = accessTokenExpiringIn(AHEAD_TOKEN_SECONDS);
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? refreshedWith(fresh) : fakeResponse({ body: {} })));

    for (const path of ['/a', '/b', '/c']) {
      await expect(authFetch(path)).resolves.toMatchObject({ status: 200 });
    }

    expect(refreshCalls()).toBe(1);
    expect(isProactiveRenewalEnabled()).toBe(false);
    // El backend sí acepta el token (su reloj está bien): se usa tal cual.
    expect(['/a', '/b', '/c'].map((path) => authsTo(path))).toEqual([[`Bearer ${fresh}`], [`Bearer ${fresh}`], [`Bearer ${fresh}`]]);
  });

  it('lo mismo si el backend emite tokens más cortos que el margen', async () => {
    await saveTokens({ accessToken: accessTokenExpiringIn(20), refreshToken: 'refresh-old' });
    fetchMock.mockImplementation(async (url) =>
      url.endsWith('/auth/refresh') ? refreshedWith(accessTokenExpiringIn(30)) : fakeResponse({ body: {} }),
    );

    await authFetch('/a');
    await authFetch('/b');

    expect(refreshCalls()).toBe(1);
    expect(isProactiveRenewalEnabled()).toBe(false);
  });

  it('sin renovación anticipada, igual renueva ante un 401', async () => {
    await saveTokens({ accessToken: accessTokenExpiringIn(AHEAD_TOKEN_SECONDS), refreshToken: 'refresh-old' });
    const refreshes = [accessTokenExpiringIn(AHEAD_TOKEN_SECONDS), accessTokenExpiringIn(AHEAD_TOKEN_SECONDS)];
    let rejectNext = false;
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return refreshedWith(refreshes.shift()!);
      if (rejectNext) {
        rejectNext = false;
        return fakeResponse({ status: 401 });
      }
      return fakeResponse({ body: {} });
    });
    await authFetch('/a');
    expect(isProactiveRenewalEnabled()).toBe(false);

    // Más tarde el token vence de verdad en el backend.
    rejectNext = true;
    await expect(authFetch('/b')).resolves.toMatchObject({ status: 200 });

    expect(refreshCalls()).toBe(2);
    expect(authsTo('/b')).toHaveLength(2);
  });

  it('se vuelve a activar cuando un refresh entrega un token con tiempo normal', async () => {
    await saveTokens({ accessToken: accessTokenExpiringIn(AHEAD_TOKEN_SECONDS), refreshToken: 'refresh-old' });
    const refreshes = [accessTokenExpiringIn(AHEAD_TOKEN_SECONDS), accessTokenExpiringIn(15 * 60)];
    let rejectNext = false;
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return refreshedWith(refreshes.shift()!);
      if (rejectNext) {
        rejectNext = false;
        return fakeResponse({ status: 401 });
      }
      return fakeResponse({ body: {} });
    });
    await authFetch('/a');
    expect(isProactiveRenewalEnabled()).toBe(false);

    // Se corrigió el reloj: el refresh por 401 entrega un token de 15 min.
    rejectNext = true;
    await authFetch('/b');

    expect(isProactiveRenewalEnabled()).toBe(true);
  });
});

// Códigos de POST /auth/refresh en backend-go: 401, 400 y 503 los responde
// handler.AuthHandler.Refresh (con esos mensajes), 429 el limitador de tokens,
// y un 500/502 sin cuerpo puede venir de un panic recuperado o de un proxy.
describe('authFetch cuando falla la renovación', () => {
  const OLD_TOKENS = { accessToken: 'access-old', refreshToken: 'refresh-old' };
  let onExpired: jest.Mock;

  beforeEach(() => {
    onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
  });

  /** La solicitud da 401 y la renovación responde `refresh`. */
  function failRefreshWith(refresh: Response) {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401 })).mockResolvedValueOnce(refresh);
  }

  it.each([
    [401, 'Refresh token inválido o expirado'],
    [401, 'Refresh token ya utilizado o revocado'],
    [400, 'refreshToken es requerido'],
  ])('un %i ("%s") cierra la sesión y borra los tokens', async (status, error) => {
    failRefreshWith(fakeResponse({ status, body: { error } }));

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it.each([
    [503, 'No se pudo verificar el estado del token, intenta nuevamente'],
    [500, undefined],
    [502, undefined],
  ])('un %i entrega ese error y conserva la sesión', async (status, error) => {
    failRefreshWith(fakeResponse({ status, body: error ? { error } : undefined }));

    const rejection = expect(authFetch('/auth/me')).rejects;
    await rejection.toMatchObject({ status });
    await rejection.not.toMatchObject({ message: DEFAULT_MESSAGES[401] });
    if (error) {
      await rejection.toMatchObject({ message: error });
    }
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual(OLD_TOKENS);
  });

  it('un 429 conserva la sesión y entrega el tiempo de espera', async () => {
    // Igual que middleware.IPRateLimiter: header Retry-After y retryAfter en el body.
    const error = 'Demasiadas solicitudes. Intenta nuevamente en 30 segundos.';
    failRefreshWith(
      fakeResponse({ status: 429, headers: { 'Retry-After': '30' }, body: { error, retryAfter: 30 } }),
    );

    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 429, retryAfter: 30, message: error });
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual(OLD_TOKENS);
  });

  it('cuando el backend se recupera, renueva con el mismo refresh token y la solicitud funciona', async () => {
    failRefreshWith(fakeResponse({ status: 503 }));
    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 503 });

    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(fakeResponse({ body: { id: '1' } }));
    const response = await authFetch('/auth/me');

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[3][0]).toMatch(/\/auth\/refresh$/);
    expect(bodyOf(fetchMock, 3)).toEqual({ refreshToken: 'refresh-old' });
    expect(authHeaderOf(fetchMock, 4)).toBe('Bearer access-new');
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it('con solicitudes simultáneas, una sola renovación fallida rechaza todas sin cerrar la sesión', async () => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith('/auth/refresh') ? fakeResponse({ status: 503 }) : fakeResponse({ status: 401 }),
    );

    const results = await Promise.allSettled([authFetch('/a'), authFetch('/b'), authFetch('/c')]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
    for (const r of results) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 503 });
    }
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual(OLD_TOKENS);
  });
});

// Renovación en segundo plano (ej. al volver la app a primer plano): nunca
// lanza, y solo cierra la sesión si el refresh token ya no sirve (tarea 4).
describe('renewIfExpiringSoon', () => {
  let onExpired: jest.Mock;

  beforeEach(() => {
    onExpired = jest.fn();
    setSessionExpiredHandler(onExpired);
  });

  async function storeAccessTokenExpiringIn(seconds: number) {
    const token = accessTokenExpiringIn(seconds);
    await saveTokens({ accessToken: token, refreshToken: 'refresh-old' });
    return token;
  }

  it('si el token vence pronto, lo renueva y guarda el par nuevo', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(refreshed);

    await expect(renewIfExpiringSoon()).resolves.toBe(true);

    expect(refreshCalls()).toBe(1);
    expect(bodyOf(fetchMock, 0)).toEqual({ refreshToken: 'refresh-old' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });

  it.each([
    ['al token le queda tiempo', () => storeAccessTokenExpiringIn(15 * 60)],
    ['no hay sesión guardada', () => clearTokens()],
    ['no se puede leer el vencimiento del token', () => saveTokens({ accessToken: 'no-es-jwt', refreshToken: 'refresh-old' })],
  ])('no hace nada si %s', async (_kind, prepare) => {
    await prepare();

    await expect(renewIfExpiringSoon()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no hace nada si la renovación anticipada está desactivada (reloj desajustado)', async () => {
    // Un refresh que entrega un token ya "por vencer" la desactiva.
    await saveTokens({ accessToken: 'access-old', refreshToken: 'refresh-old' });
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { accessToken: accessTokenExpiringIn(-300), refreshToken: 'refresh-new' } }));
    await refreshAccessToken();
    expect(isProactiveRenewalEnabled()).toBe(false);

    await expect(renewIfExpiringSoon()).resolves.toBe(false);
    expect(refreshCalls()).toBe(1);
  });

  it.each([
    ['sin conexión', () => fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))],
    ['con 503', () => fetchMock.mockResolvedValueOnce(fakeResponse({ status: 503 }))],
    ['con 429', () => fetchMock.mockResolvedValueOnce(fakeResponse({ status: 429, body: { retryAfter: 30 } }))],
  ])('si el refresh falla %s, no lanza ni cierra la sesión', async (_kind, failRefresh) => {
    const token = await storeAccessTokenExpiringIn(30);
    failRefresh();

    await expect(renewIfExpiringSoon()).resolves.toBe(false);
    expect(onExpired).not.toHaveBeenCalled();
    await expect(getTokens()).resolves.toEqual({ accessToken: token, refreshToken: 'refresh-old' });
  });

  it('si el refresh token ya no sirve, cierra la sesión sin lanzar', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Refresh token ya utilizado o revocado' } }));

    await expect(renewIfExpiringSoon()).resolves.toBe(false);
    expect(onExpired).toHaveBeenCalledTimes(1);
    await expect(getTokens()).resolves.toBeNull();
  });

  it('comparte la renovación con una solicitud que sale al mismo tiempo', async () => {
    await storeAccessTokenExpiringIn(30);
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? refreshed : fakeResponse({ body: {} })));

    await Promise.all([renewIfExpiringSoon(), authFetch('/a')]);

    expect(refreshCalls()).toBe(1);
    expect(authsTo('/a')).toEqual(['Bearer access-new']);
  });
});

describe('isSessionInvalid', () => {
  it.each([401, 400])('un %i del refresh significa que la sesión ya no sirve', (status) => {
    expect(isSessionInvalid(new ApiError(status, 'x'))).toBe(true);
  });

  it.each([0, 429, 500, 502, 503])('un %i del refresh es pasajero: la sesión se conserva', (status) => {
    expect(isSessionInvalid(new ApiError(status, 'x'))).toBe(false);
  });

  it('un error que no viene de la API no cierra la sesión', () => {
    expect(isSessionInvalid(new Error('SecureStore no disponible'))).toBe(false);
    expect(isSessionInvalid(undefined)).toBe(false);
  });
});
