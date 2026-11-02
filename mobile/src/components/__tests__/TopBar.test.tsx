import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { mockAuthValue } from '../../test-utils/auth';
import { TopBar, type TopBarVariant } from '../TopBar';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const signOut = jest.fn(() => Promise.resolve());
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

async function renderBar(variant: TopBarVariant) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <TopBar variant={variant} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ signOut }));
});

describe('TopBar', () => {
  it('pasajero: marca con degradado y "Cerrar sesión", como la barra del web', async () => {
    await renderBar('passenger');

    expect(screen.getByLabelText('TransitHub')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(screen.queryByText('Panel de empresa')).toBeNull();
  });

  it('empresa: "TransitHub" y la bajada "Panel de empresa" del web', async () => {
    await renderBar('company');

    expect(screen.getByText('TransitHub')).toBeTruthy();
    expect(screen.getByText('Panel de empresa')).toBeTruthy();
  });

  it('administración: "TransitHub" y "ADMINISTRACIÓN" con degradado', async () => {
    await renderBar('admin');

    expect(screen.getByText('TransitHub')).toBeTruthy();
    expect(screen.getByLabelText('ADMINISTRACIÓN')).toBeTruthy();
  });

  it('deja espacio para la barra de estado del teléfono', async () => {
    await renderBar('passenger');

    const bar = screen.getByRole('button', { name: 'Cerrar sesión' }).parent;
    expect(bar?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ paddingTop: 47 + 8 })]));
  });

  it.each(['passenger', 'company', 'admin'] as const)('%s: "Cerrar sesión" pide confirmación y cierra la sesión', async (variant) => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderBar(variant);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(alertSpy).toHaveBeenCalledWith('Cerrar sesión', '¿Quieres cerrar tu sesión en este dispositivo?', expect.any(Array));
    expect(signOut).not.toHaveBeenCalled();

    const buttons: AlertButton[] = alertSpy.mock.calls[0][2] ?? [];
    await buttons.find((b) => b.text === 'Cerrar sesión')?.onPress?.();
    expect(signOut).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});
