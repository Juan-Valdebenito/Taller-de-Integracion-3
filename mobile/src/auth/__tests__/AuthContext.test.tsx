import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import * as authApi from '../../api/authApi';
import { ApiError } from '../../api/errors';
import { setSessionExpiredHandler } from '../../api/interceptor';
import { AuthProvider, useAuth, type AuthContextValue } from '../AuthContext';

jest.mock('../../api/authApi');
jest.mock('../../api/interceptor', () => {
  const actual = jest.requireActual('../../api/interceptor');
  return { ...actual, setSessionExpiredHandler: jest.fn() };
});

const mockedApi = jest.mocked(authApi);
const user = { id: 'u1', name: 'Ana', email: 'ana@correo.cl', role: 'PASSENGER' as const };

let auth: AuthContextValue;
function Probe() {
  auth = useAuth();
  return <Text>{`estado:${auth.status}`}</Text>;
}

async function renderProvider() {
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('AuthProvider', () => {
  it('entra con la sesión guardada al abrir la app', async () => {
    mockedApi.restoreSession.mockResolvedValue(user);
    await renderProvider();

    expect(await screen.findByText('estado:signedIn')).toBeTruthy();
    expect(auth.user).toEqual(user);
  });

  it('queda sin sesión si no hay tokens guardados', async () => {
    mockedApi.restoreSession.mockResolvedValue(null);
    await renderProvider();

    expect(await screen.findByText('estado:signedOut')).toBeTruthy();
    expect(auth.restoreError).toBeNull();
  });

  it('informa el error si no hay conexión al recuperar la sesión', async () => {
    mockedApi.restoreSession.mockRejectedValue(new ApiError(0, 'No se pudo conectar con el servidor.'));
    await renderProvider();

    expect(await screen.findByText('estado:signedOut')).toBeTruthy();
    expect(auth.restoreError).toBe('No se pudo conectar con el servidor.');
  });

  it.each([
    [503, 'No se pudo verificar el estado del token, intenta nuevamente'],
    [429, 'Demasiadas solicitudes. Intenta nuevamente en 30 segundos.'],
    [500, 'Error del servidor. Inténtalo más tarde.'],
  ])('con una falla pasajera (%i) al recuperar la sesión, muestra el aviso del servidor', async (status, message) => {
    mockedApi.restoreSession.mockRejectedValue(new ApiError(status, message));
    await renderProvider();

    expect(await screen.findByText('estado:signedOut')).toBeTruthy();
    expect(auth.restoreError).toBe(message);
    expect(auth.user).toBeNull();
  });

  it.each([
    ['429 con Retry-After', new ApiError(429, 'Demasiadas solicitudes. Intenta nuevamente en 30 segundos.', 30), 30],
    ['429 sin Retry-After', new ApiError(429, 'Demasiados intentos.'), 60],
    ['503', new ApiError(503, 'El servicio no está disponible en este momento.'), null],
    ['sin conexión', new ApiError(0, 'No se pudo conectar con el servidor.'), null],
  ])('con %s al recuperar la sesión, indica cuánto esperar antes de reintentar', async (_kind, error, seconds) => {
    mockedApi.restoreSession.mockRejectedValue(error);
    await renderProvider();
    await screen.findByText('estado:signedOut');

    expect(auth.restoreRetryAfter).toBe(seconds);
  });

  it.each([
    ['al recuperar la sesión con el reintento', () => auth.retryRestore()],
    ['al iniciar sesión con la contraseña', () => auth.signIn({ email: 'ana@correo.cl', password: 'secreta123' })],
  ])('limpia el aviso y la espera %s', async (_kind, action) => {
    // Sin "Once" para el segundo valor: al iniciar sesión no se vuelve a llamar
    // y quedaría en la cola para la prueba siguiente.
    mockedApi.restoreSession.mockResolvedValue(user).mockRejectedValueOnce(new ApiError(429, 'Demasiadas solicitudes.', 30));
    mockedApi.login.mockResolvedValue(user);
    await renderProvider();
    await screen.findByText('estado:signedOut');
    expect(auth.restoreRetryAfter).toBe(30);

    await act(action);

    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(auth.restoreRetryAfter).toBeNull();
    expect(auth.restoreError).toBeNull();
  });

  it('al reintentar cuando el backend se recupera, entra sin pedir la contraseña', async () => {
    mockedApi.restoreSession
      .mockRejectedValueOnce(new ApiError(503, 'No se pudo verificar el estado del token, intenta nuevamente'))
      .mockResolvedValueOnce(user);
    await renderProvider();
    await screen.findByText('estado:signedOut');

    await act(() => auth.retryRestore());

    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(auth.user).toEqual(user);
    expect(auth.restoreError).toBeNull();
    expect(mockedApi.login).not.toHaveBeenCalled();
  });

  it('si el reintento vuelve a fallar, sigue sin sesión con el aviso nuevo', async () => {
    mockedApi.restoreSession
      .mockRejectedValueOnce(new ApiError(503, 'No se pudo verificar el estado del token, intenta nuevamente'))
      .mockRejectedValueOnce(new ApiError(0, 'No se pudo conectar con el servidor.'));
    await renderProvider();
    await screen.findByText('estado:signedOut');

    await act(() => auth.retryRestore());

    expect(screen.getByText('estado:signedOut')).toBeTruthy();
    expect(auth.restoreError).toBe('No se pudo conectar con el servidor.');
  });

  it('una falla pasajera durante la sesión no saca al usuario', async () => {
    mockedApi.restoreSession.mockResolvedValue(user);
    mockedApi.getCurrentUser.mockRejectedValue(new ApiError(503, 'El servicio no está disponible en este momento.'));
    await renderProvider();
    await screen.findByText('estado:signedIn');

    await act(async () => {
      await expect(auth.refreshUser()).rejects.toMatchObject({ status: 503 });
    });

    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(auth.user).toEqual(user);
  });

  it('inicia y cierra sesión', async () => {
    mockedApi.restoreSession.mockResolvedValue(null);
    mockedApi.login.mockResolvedValue(user);
    mockedApi.logout.mockResolvedValue({ serverConfirmed: true });
    await renderProvider();
    await screen.findByText('estado:signedOut');

    await act(() => auth.signIn({ email: 'ana@correo.cl', password: 'secreta123' }));
    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(mockedApi.login).toHaveBeenCalledWith({ email: 'ana@correo.cl', password: 'secreta123' });

    await act(() => auth.signOut());
    expect(screen.getByText('estado:signedOut')).toBeTruthy();
    expect(mockedApi.logout).toHaveBeenCalledTimes(1);
    expect(auth.signOutNotice).toBeNull();
  });

  it('avisa si el servidor no confirmó la lista negra, y limpia el aviso al volver a entrar', async () => {
    mockedApi.restoreSession.mockResolvedValue(user);
    mockedApi.logout.mockResolvedValue({ serverConfirmed: false });
    mockedApi.login.mockResolvedValue(user);
    await renderProvider();
    await screen.findByText('estado:signedIn');

    await act(() => auth.signOut());
    expect(screen.getByText('estado:signedOut')).toBeTruthy();
    expect(auth.signOutNotice).toContain('no se pudo confirmar con el servidor');

    await act(() => auth.signIn({ email: 'ana@correo.cl', password: 'secreta123' }));
    expect(auth.signOutNotice).toBeNull();
  });

  it('actualiza los datos del usuario desde el servidor', async () => {
    mockedApi.restoreSession.mockResolvedValue(user);
    mockedApi.getCurrentUser.mockResolvedValue({ ...user, name: 'Ana Actualizada' });
    await renderProvider();
    await screen.findByText('estado:signedIn');

    await act(() => auth.refreshUser());

    expect(mockedApi.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(auth.user?.name).toBe('Ana Actualizada');
  });

  it('vuelve a "sin sesión" cuando la API avisa que la sesión expiró', async () => {
    mockedApi.restoreSession.mockResolvedValue(user);
    await renderProvider();
    await screen.findByText('estado:signedIn');

    const onExpired = jest.mocked(setSessionExpiredHandler).mock.calls[0][0] as () => void;
    await act(async () => onExpired());

    expect(screen.getByText('estado:signedOut')).toBeTruthy();
    expect(auth.user).toBeNull();
  });
});
