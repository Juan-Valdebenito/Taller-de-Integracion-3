import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { useAuth, type AuthContextValue } from '../../auth/AuthContext';
import { mockAuthValue } from '../../test-utils/auth';
import { LoginScreen } from '../LoginScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const signIn = jest.fn();
function mockAuth(overrides: Partial<AuthContextValue> = {}) {
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ signIn, ...overrides }));
}

async function fillAndSubmit(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth();
});

describe('LoginScreen', () => {
  it('valida los campos antes de enviar', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(screen.getByText('Ingresa tu correo electrónico.')).toBeTruthy();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('inicia sesión con los datos ingresados', async () => {
    signIn.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await fillAndSubmit('ana@correo.cl', 'secreta123');

    expect(signIn).toHaveBeenCalledWith({ email: 'ana@correo.cl', password: 'secreta123' });
  });

  it('muestra el error del servidor', async () => {
    signIn.mockRejectedValue(new ApiError(401, 'Credenciales inválidas'));
    await render(<LoginScreen />);
    await fillAndSubmit('ana@correo.cl', 'mala');

    expect(await screen.findByText('Credenciales inválidas')).toBeTruthy();
  });

  it('bloquea el botón con cuenta regresiva ante el límite de intentos (429)', async () => {
    signIn.mockRejectedValue(new ApiError(429, 'Demasiadas solicitudes. Intenta nuevamente en 30 segundos.', 30));
    await render(<LoginScreen />);
    await fillAndSubmit('ana@correo.cl', 'secreta123');

    expect(await screen.findByText('Demasiadas solicitudes. Intenta nuevamente en 30 segundos.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Espera 30 s' });
    expect(button).toBeDisabled();
  });

  it('ofrece reintentar si no se pudo recuperar la sesión', async () => {
    const retryRestore = jest.fn();
    mockAuth({ restoreError: 'No se pudo conectar con el servidor.', retryRestore });
    await render(<LoginScreen />);

    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar conexión' }));
    expect(retryRestore).toHaveBeenCalledTimes(1);
  });

  it('muestra el aviso si el cierre de sesión no se confirmó con el servidor', async () => {
    mockAuth({ signOutNotice: 'Cerraste sesión en este dispositivo, pero no se pudo confirmar con el servidor.' });
    await render(<LoginScreen />);

    expect(screen.getByText('Cerraste sesión en este dispositivo, pero no se pudo confirmar con el servidor.')).toBeTruthy();
  });

  it('lleva al registro', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '¿No tienes cuenta? Regístrate' }));

    expect(mockPush).toHaveBeenCalledWith('/register');
  });
});
