import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { mockAuthValue } from '../../test-utils/auth';
import { RegisterScreen } from '../RegisterScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const signUp = jest.fn();

async function fill(values: { name: string; email: string; password: string; confirm: string }) {
  await fireEvent.changeText(screen.getByLabelText('Nombre'), values.name);
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), values.email);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), values.password);
  await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), values.confirm);
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ signUp }));
});

describe('RegisterScreen', () => {
  it('valida largo de contraseña y confirmación', async () => {
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: '123', confirm: '456' });
    await submit();

    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeTruthy();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('registra al pasajero sin enviar la confirmación', async () => {
    signUp.mockResolvedValue(undefined);
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123', confirm: 'secreta123' });
    await submit();

    expect(signUp).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
  });

  it('muestra bajo cada campo los errores de validación del servidor', async () => {
    signUp.mockRejectedValue(
      new ApiError(400, 'El correo ya está registrado', undefined, { email: 'El email ana@correo.cl ya está registrado' }),
    );
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123', confirm: 'secreta123' });
    await submit();

    expect(await screen.findByText('El email ana@correo.cl ya está registrado')).toBeTruthy();
  });

  it('vuelve al login', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '¿Ya tienes cuenta? Inicia sesión' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
