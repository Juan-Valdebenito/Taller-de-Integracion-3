import { act, render, screen } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { AuthUser } from '../../auth/types';
import { mockAuthValue } from '../../test-utils/auth';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const user: AuthUser = {
  id: 'u1',
  name: 'Ana María Pérez',
  email: 'ana@correo.cl',
  role: 'PASSENGER',
  isActive: true,
  createdAt: '2026-10-16T15:00:00Z',
};

function mockAuth(overrides = {}) {
  const value = mockAuthValue({ status: 'signedIn', user, refreshUser: jest.fn().mockResolvedValue(undefined), ...overrides });
  jest.mocked(useAuth).mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe('ProfileScreen', () => {
  it('muestra los datos de la cuenta', async () => {
    mockAuth();
    await render(<ProfileScreen />);

    expect(screen.getByText('AP')).toBeTruthy(); // iniciales del avatar
    expect(screen.getByRole('header', { name: 'Ana María Pérez' })).toBeTruthy();
    expect(screen.getByText('ana@correo.cl')).toBeTruthy();
    expect(screen.getAllByText('Pasajero').length).toBeGreaterThan(0);
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('16 de octubre de 2026')).toBeTruthy();
  });

  it('actualiza los datos desde el servidor al entrar', async () => {
    const auth = mockAuth();
    await render(<ProfileScreen />);

    expect(auth.refreshUser).toHaveBeenCalledTimes(1);
  });

  it('mantiene los datos y avisa si no se pudo actualizar', async () => {
    mockAuth({ refreshUser: jest.fn().mockRejectedValue(new ApiError(0, 'No se pudo conectar con el servidor.')) });
    await render(<ProfileScreen />);

    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeTruthy();
    expect(screen.getByText('ana@correo.cl')).toBeTruthy();
  });

  it('marca la cuenta desactivada y no muestra fecha si no viene', async () => {
    mockAuth({ user: { ...user, isActive: false, createdAt: undefined } });
    await render(<ProfileScreen />);

    expect(screen.getByText('Desactivada')).toBeTruthy();
    expect(screen.queryByText('Miembro desde')).toBeNull();
  });

  it('vuelve a pedir los datos al deslizar para actualizar', async () => {
    const auth = mockAuth();
    await render(<ProfileScreen />);

    // El RefreshControl del mock de RN no expone props: se invoca su onRefresh
    // desde la prop refreshControl del ScrollView, como lo haría el gesto.
    const scroll = screen.getByTestId('profile-scroll');
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });

    expect(auth.refreshUser).toHaveBeenCalledTimes(2);
  });
});
