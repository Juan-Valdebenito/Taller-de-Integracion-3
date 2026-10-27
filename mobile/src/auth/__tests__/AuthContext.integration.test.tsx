import { act, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';

import { getTokens, saveTokens } from '../../storage/tokenStorage';
import { bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { AuthProvider, useAuth, type AuthContextValue } from '../AuthContext';

// Cadena completa al abrir la app: AuthProvider → authApi.restoreSession →
// interceptor → fetch (simulado como backend-go). Solo fetch es falso.

const mockStore = SecureStore as unknown as { __reset: () => void };
const user = { id: 'u1', name: 'Ana', email: 'ana@correo.cl', role: 'PASSENGER' };
const OLD_TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };
let fetchMock: FetchMock;

let auth: AuthContextValue;
function Probe() {
  auth = useAuth();
  return <Text>{`estado:${auth.status}`}</Text>;
}

async function openApp() {
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens(OLD_TOKENS);
});

describe('abrir la app con el access token vencido', () => {
  it('si el refresh da 503, muestra el aviso, conserva los tokens y el reintento entra solo', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Token expirado' } }))
      .mockResolvedValueOnce(
        fakeResponse({ status: 503, body: { error: 'No se pudo verificar el estado del token, intenta nuevamente' } }),
      );
    await openApp();

    expect(await screen.findByText('estado:signedOut')).toBeTruthy();
    expect(auth.restoreError).toBe('No se pudo verificar el estado del token, intenta nuevamente');
    await expect(getTokens()).resolves.toEqual(OLD_TOKENS);

    // El backend vuelve: el botón "Reintentar conexión" llama a retryRestore.
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ body: { accessToken: 'access-2', refreshToken: 'refresh-2', user } }))
      .mockResolvedValueOnce(fakeResponse({ body: user }));
    await act(() => auth.retryRestore());

    expect(screen.getByText('estado:signedIn')).toBeTruthy();
    expect(auth.user).toEqual(user);
    expect(auth.restoreError).toBeNull();
    expect(bodyOf(fetchMock, 3)).toEqual({ refreshToken: 'refresh-1' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('si el refresh da 401, queda sin sesión, sin aviso de error y sin tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 401 }))
      .mockResolvedValueOnce(fakeResponse({ status: 401, body: { error: 'Refresh token ya utilizado o revocado' } }));
    await openApp();

    expect(await screen.findByText('estado:signedOut')).toBeTruthy();
    // Sesión inválida no es un error de conexión: se muestra el login normal.
    expect(auth.restoreError).toBeNull();
    await expect(getTokens()).resolves.toBeNull();
  });
});
