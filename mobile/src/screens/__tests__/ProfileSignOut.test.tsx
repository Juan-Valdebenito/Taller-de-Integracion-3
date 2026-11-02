import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { useAuth } from '../../auth/AuthContext';
import type { AuthUser } from '../../auth/types';
import { mockAuthValue } from '../../test-utils/auth';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const user: AuthUser = { id: 'u1', name: 'Ana', email: 'ana@correo.cl', role: 'PASSENGER', isActive: true };

function setup() {
  const signOut = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useAuth).mockReturnValue(
    mockAuthValue({ status: 'signedIn', user, signOut, refreshUser: jest.fn().mockResolvedValue(undefined) }),
  );
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  return { signOut, alertSpy };
}

/** Botones del último diálogo de confirmación mostrado. */
function dialogButtons(alertSpy: jest.SpyInstance): AlertButton[] {
  return alertSpy.mock.calls.at(-1)?.[2] ?? [];
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('ProfileScreen › cerrar sesión', () => {
  it('pide confirmación antes de cerrar sesión', async () => {
    const { signOut, alertSpy } = setup();
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(alertSpy).toHaveBeenCalledWith('Cerrar sesión', expect.any(String), expect.any(Array));
    expect(signOut).not.toHaveBeenCalled();
  });

  it('al confirmar, envía los tokens a la lista negra (signOut)', async () => {
    const { signOut, alertSpy } = setup();
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    const confirm = dialogButtons(alertSpy).find((b) => b.style === 'destructive');
    await confirm?.onPress?.();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('al cancelar, no cierra la sesión', async () => {
    const { signOut, alertSpy } = setup();
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    const cancel = dialogButtons(alertSpy).find((b) => b.style === 'cancel');
    expect(cancel?.text).toBe('Cancelar');
    cancel?.onPress?.();

    expect(signOut).not.toHaveBeenCalled();
  });
});
