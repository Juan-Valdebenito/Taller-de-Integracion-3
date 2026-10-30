import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

const PASSWORD_LABEL = 'Contraseña (Mín. 8 caracteres, letras y números)';

async function fill(values: { name: string; email: string; password: string }) {
  await fireEvent.changeText(screen.getByLabelText('Nombre Completo'), values.name);
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), values.email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), values.password);
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Crear Cuenta Segura' }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ signUp }));
});

describe('RegisterScreen', () => {
  it('valida el largo de la contraseña', async () => {
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: '123' });
    await submit();

    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('registra con nombre, correo y contraseña', async () => {
    signUp.mockResolvedValue(undefined);
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    await submit();

    expect(signUp).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
  });

  it('muestra bajo cada campo los errores de validación del servidor', async () => {
    signUp.mockRejectedValue(
      new ApiError(400, 'El correo ya está registrado', undefined, { email: 'El email ana@correo.cl ya está registrado' }),
    );
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    await submit();

    expect(await screen.findByText('El email ana@correo.cl ya está registrado')).toBeTruthy();
  });

  it('vuelve al login con el enlace del pie, como el web', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByRole('link', { name: 'Inicia sesión' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('muestra los textos y campos del registro del web, sin confirmar contraseña', async () => {
    await render(<RegisterScreen />);

    expect(screen.getByRole('header', { name: 'Crear cuenta' })).toBeTruthy();
    expect(screen.getByText('Tus datos son sanitizados y tu contraseña es hasheada con bcrypt')).toBeTruthy();
    expect(screen.getByLabelText('Nombre Completo').props.placeholder).toBe('Juan Valdebenito');
    expect(screen.getByLabelText('Correo electrónico').props.placeholder).toBe('juan@ejemplo.cl');
    expect(screen.getByLabelText(PASSWORD_LABEL).props.placeholder).toBe('Al menos 8 caracteres...');
    expect(screen.queryByLabelText('Confirmar contraseña')).toBeNull();
    expect(screen.getByText(/¿Ya tienes cuenta\?/)).toBeTruthy();
  });

  it('mientras registra muestra "Registrando y Protegiendo Datos..."', async () => {
    let finish!: () => void;
    signUp.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<RegisterScreen />);
    await fill({ name: 'Ana', email: 'ana@correo.cl', password: 'secreta123' });
    // Sin await: el registro queda pendiente hasta finish().
    const pressing = submit();

    expect(await screen.findByRole('button', { name: 'Registrando y Protegiendo Datos...' })).toBeDisabled();
    await act(async () => finish());
    await pressing;
  });
});
