import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth();
});

describe('LoginScreen', () => {
  it('valida los campos antes de enviar', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

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

  describe('con límite de intentos (429) al recuperar la sesión', () => {
    const restoreError = 'Demasiadas solicitudes. Intenta nuevamente en 3 segundos.';

    afterEach(() => {
      jest.useRealTimers();
    });

    it('el botón de reintentar espera la cuenta regresiva y después reintenta', async () => {
      jest.useFakeTimers();
      const retryRestore = jest.fn();
      mockAuth({ restoreError, restoreRetryAfter: 3, retryRestore });
      await render(<LoginScreen />);

      expect(screen.getByText(restoreError)).toBeTruthy();
      const waiting = screen.getByRole('button', { name: 'Reintentar en 3 s' });
      expect(waiting).toBeDisabled();
      await fireEvent.press(waiting);
      expect(retryRestore).not.toHaveBeenCalled();

      // useCooldown descuenta de a un segundo (un setTimeout por render).
      for (const left of [2, 1]) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
        expect(screen.getByRole('button', { name: `Reintentar en ${left} s` })).toBeDisabled();
      }
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      const retry = screen.getByRole('button', { name: 'Reintentar conexión' });
      expect(retry).toBeEnabled();
      await fireEvent.press(retry);
      expect(retryRestore).toHaveBeenCalledTimes(1);
    });

    it('el formulario de login sigue disponible (el límite es el de renovar tokens)', async () => {
      signIn.mockResolvedValue(undefined);
      mockAuth({ restoreError, restoreRetryAfter: 3 });
      await render(<LoginScreen />);

      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
      await fillAndSubmit('ana@correo.cl', 'secreta123');
      expect(signIn).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra el aviso si el cierre de sesión no se confirmó con el servidor', async () => {
    mockAuth({ signOutNotice: 'Cerraste sesión en este dispositivo, pero no se pudo confirmar con el servidor.' });
    await render(<LoginScreen />);

    expect(screen.getByText('Cerraste sesión en este dispositivo, pero no se pudo confirmar con el servidor.')).toBeTruthy();
  });

  it('lleva al registro con el enlace del pie, como el web', async () => {
    await render(<LoginScreen />);
    expect(screen.getByText(/¿No tienes cuenta\?/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Regístrate aquí' }));

    expect(mockPush).toHaveBeenCalledWith('/register');
  });

  describe('igual al login del web', () => {
    it('muestra el encabezado, los textos y los campos del web', async () => {
      await render(<LoginScreen />);

      expect(screen.getByText('TransitHub')).toBeTruthy();
      expect(screen.getByText('Plataforma de Transporte Público Urbano')).toBeTruthy();
      expect(screen.getByRole('header', { name: 'Iniciar sesión' })).toBeTruthy();
      expect(screen.getByText('Ingresa tus credenciales protegidas con hash bcrypt')).toBeTruthy();
      expect(screen.getByLabelText('Correo electrónico').props.placeholder).toBe('ejemplo@transporte.cl');
      expect(screen.getByLabelText('Contraseña').props.placeholder).toBe('••••••••');
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    });

    it('mientras verifica muestra "Verificando..." y no deja enviar de nuevo', async () => {
      let finish!: () => void;
      signIn.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      await render(<LoginScreen />);
      await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@correo.cl');
      await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'secreta123');
      // Sin await: el envío queda pendiente hasta finish().
      const pressing = fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('button', { name: 'Verificando...' })).toBeDisabled();
      await act(async () => finish());
      await pressing;
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    });

    it.each([
      ['Admin', 'admin@transporte.cl', 'admin12345'],
      ['Pasajero', 'carlos.pasajero@gmail.com', 'Pasajero1234!'],
    ])('la cuenta de prueba %s rellena el formulario y limpia el error', async (label, email, password) => {
      signIn.mockRejectedValueOnce(new ApiError(401, 'Credenciales inválidas')).mockResolvedValueOnce(undefined);
      await render(<LoginScreen />);
      expect(screen.getByText('CUENTAS DE PRUEBA SIMULADAS (CON HASH BCRYPT):')).toBeTruthy();
      await fillAndSubmit('otra@correo.cl', 'mala1234');
      expect(await screen.findByText('Credenciales inválidas')).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: `Usar cuenta de prueba ${label}` }));

      expect(screen.queryByText('Credenciales inválidas')).toBeNull();
      expect(screen.getByLabelText('Correo electrónico').props.value).toBe(email);
      expect(screen.getByLabelText('Contraseña').props.value).toBe(password);
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      expect(signIn).toHaveBeenLastCalledWith({ email, password });
    });
  });
});
