import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Alert, Platform, StyleSheet, type AlertButton } from 'react-native';

import { SettingsProvider } from '../../settings/SettingsContext';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from '../../settings/settingsStorage';
import { ThemeProvider } from '../../theme';
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
    expect(radio('Oscuro').props.accessibilityState.checked).toBe(true);
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
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true, theme: 'light' }));
    await renderScreen();
    await waitFor(() => expect(radio('Claro').props.accessibilityState.checked).toBe(true));

    await fireEvent.press(screen.getByRole('button', { name: 'Restablecer valores por defecto' }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons: AlertButton[] = alertSpy.mock.calls[0][2] ?? [];

    await act(async () => {
      buttons.find((b) => b.text === 'Restablecer')?.onPress?.();
    });

    expect(radio('Oscuro').props.accessibilityState.checked).toBe(true);
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
  it('elegir "Muy grande" agranda el texto de la app al instante (vista previa)', async () => {
    await render(
      <SettingsProvider>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </SettingsProvider>,
    );
    await waitFor(() => expect(radio('Normal').props.accessibilityState.checked).toBe(true));
    const fontSize = () => StyleSheet.flatten(screen.getByLabelText('Vista previa del tamaño del texto').props.style).fontSize;
    expect(fontSize()).toBe(16);

    await fireEvent.press(radio('Muy grande'));

    expect(fontSize()).toBe(21);
  });
  describe('notificaciones push', () => {
    const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
    const blocked = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };

    afterEach(() => getPermissions.mockImplementation(async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' })));

    it('permiso bloqueado: el interruptor no se activa y ofrece abrir los ajustes', async () => {
      getPermissions.mockImplementation(async () => blocked);
      await renderScreen();

      await fireEvent(screen.getByRole('switch', { name: 'Notificaciones push' }), 'valueChange', true);

      await waitFor(() => expect(screen.getByText(/desactivadas para TransitHub/)).toBeTruthy());
      expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(false);
      expect(screen.getByRole('button', { name: 'Abrir ajustes' })).toBeTruthy();
      await expect(loadSettings()).resolves.toMatchObject({ notificationsEnabled: false });
    });

    it('avisa si se quitó el permiso desde el teléfono', async () => {
      getPermissions.mockImplementation(async () => blocked);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true }));
      await renderScreen();

      await waitFor(() => expect(screen.getByText(/Quitaste el permiso de notificaciones/)).toBeTruthy());
      expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(false);
    });
  });

  describe('notificación de prueba', () => {
    it('sin notificaciones activas no se muestra el botón', async () => {
      await renderScreen();
      expect(screen.queryByRole('button', { name: 'Enviar notificación de prueba' })).toBeNull();
    });

    it('con notificaciones activas la envía y confirma', async () => {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true }));
      await renderScreen();
      const button = await waitFor(() => screen.getByRole('button', { name: 'Enviar notificación de prueba' }));

      await fireEvent.press(button);

      await waitFor(() => expect(screen.getByText('Listo: revisa la notificación en tu teléfono.')).toBeTruthy());
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('vista previa web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    afterEach(() => {
      delete (globalThis as { confirm?: unknown }).confirm;
    });

    it('las notificaciones aparecen desactivadas con la explicación', async () => {
      await renderScreen();

      const toggle = screen.getByRole('switch', { name: 'Notificaciones push' });
      expect(toggle.props.value).toBe(false);
      expect(toggle.props.disabled).toBe(true);
      expect(screen.getByText(/Solo están disponibles en la app del teléfono/)).toBeTruthy();
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('restablecer usa el diálogo del navegador', async () => {
      (globalThis as { confirm?: unknown }).confirm = jest.fn(() => true);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light' }));
      await renderScreen();
      await waitFor(() => expect(radio('Claro').props.accessibilityState.checked).toBe(true));

      await fireEvent.press(screen.getByRole('button', { name: 'Restablecer valores por defecto' }));

      expect(globalThis.confirm).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(radio('Oscuro').props.accessibilityState.checked).toBe(true));
    });
  });
});
