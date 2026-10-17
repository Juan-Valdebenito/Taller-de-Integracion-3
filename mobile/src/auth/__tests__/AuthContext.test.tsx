import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import * as authApi from '../../api/authApi';
import { ApiError, setSessionExpiredHandler } from '../../api/client';
import { AuthProvider, useAuth, type AuthContextValue } from '../AuthContext';

jest.mock('../../api/authApi');
jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
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

  it('inicia y cierra sesión', async () => {
    mockedApi.restoreSession.mockResolvedValue(null);
    mockedApi.login.mockResolvedValue(user);
    mockedApi.logout.mockResolvedValue();
    await renderProvider();
    await screen.findByText('estado:signedOut');

    await act(() => auth.signIn({ email: 'ana@correo.cl', password: 'secreta123' }));
    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(mockedApi.login).toHaveBeenCalledWith({ email: 'ana@correo.cl', password: 'secreta123' });

    await act(() => auth.signOut());
    expect(screen.getByText('estado:signedOut')).toBeTruthy();
    expect(mockedApi.logout).toHaveBeenCalledTimes(1);
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
