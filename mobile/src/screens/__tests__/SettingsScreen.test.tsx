import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { SettingsProvider } from '../../settings/SettingsContext';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from '../../settings/settingsStorage';
import { SettingsScreen } from '../SettingsScreen';

async function renderScreen() {
  await render(
    <SettingsProvider>
      <SettingsScreen />
    </SettingsProvider>,
  );
  // Espera a que se lean las preferencias guardadas.
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Notificaciones push' })).toBeTruthy());
}

const radio = (name: string) => screen.getByRole('radio', { name });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('SettingsScreen', () => {
  it('muestra las secciones con los valores por defecto', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Notificaciones' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Interfaz' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(false);
    expect(screen.getByRole('switch', { name: 'Vibración' }).props.value).toBe(true);
    expect(radio('Sistema').props.accessibilityState.checked).toBe(true);
    expect(radio('Normal').props.accessibilityState.checked).toBe(true);
  });

  it('muestra las preferencias guardadas', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true, theme: 'dark', textSize: 'large' }));
    await renderScreen();

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(true));
    expect(radio('Oscuro').props.accessibilityState.checked).toBe(true);
    expect(radio('Grande').props.accessibilityState.checked).toBe(true);
  });

  it('activar notificaciones y desactivar vibración queda guardado', async () => {
    await renderScreen();

    await fireEvent(screen.getByRole('switch', { name: 'Notificaciones push' }), 'valueChange', true);
    await fireEvent(screen.getByRole('switch', { name: 'Vibración' }), 'valueChange', false);

    expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(true);
    await waitFor(async () =>
      expect(await loadSettings()).toMatchObject({ notificationsEnabled: true, vibrationEnabled: false }),
    );
  });

  it('cambiar el tema y el tamaño del texto queda guardado', async () => {
    await renderScreen();

    await fireEvent.press(radio('Oscuro'));
    await fireEvent.press(radio('Muy grande'));

    expect(radio('Oscuro').props.accessibilityState.checked).toBe(true);
    expect(radio('Sistema').props.accessibilityState.checked).toBe(false);
    expect(radio('Muy grande').props.accessibilityState.checked).toBe(true);
    await waitFor(async () => expect(await loadSettings()).toMatchObject({ theme: 'dark', textSize: 'extraLarge' }));
  });

  it('restablecer pide confirmación y vuelve a los valores por defecto', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true, theme: 'dark' }));
    await renderScreen();
    await waitFor(() => expect(radio('Oscuro').props.accessibilityState.checked).toBe(true));

    await fireEvent.press(screen.getByRole('button', { name: 'Restablecer valores por defecto' }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons: AlertButton[] = alertSpy.mock.calls[0][2] ?? [];

    await act(async () => {
      buttons.find((b) => b.text === 'Restablecer')?.onPress?.();
    });

    expect(radio('Sistema').props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(false);
    await waitFor(async () => expect(await loadSettings()).toEqual(DEFAULT_SETTINGS));
  });

  it('cancelar el restablecimiento no cambia nada', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
    await renderScreen();
    await waitFor(() => expect(radio('Oscuro').props.accessibilityState.checked).toBe(true));

    await fireEvent.press(screen.getByRole('button', { name: 'Restablecer valores por defecto' }));
    const buttons: AlertButton[] = alertSpy.mock.calls[0][2] ?? [];
    expect(buttons.find((b) => b.text === 'Cancelar')?.style).toBe('cancel');

    expect(radio('Oscuro').props.accessibilityState.checked).toBe(true);
  });

  it('si no se puede guardar, muestra el aviso', async () => {
    await renderScreen();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    await fireEvent.press(radio('Claro'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/No se pudo guardar la configuración/)).toBeTruthy();
    expect(radio('Claro').props.accessibilityState.checked).toBe(true);
  });
});
