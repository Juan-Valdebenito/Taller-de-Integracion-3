import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { AppState, Linking } from 'react-native';

import { SettingsProvider, useSettings } from '../../settings/SettingsContext';
import { SETTINGS_KEY, loadSettings } from '../../settings/settingsStorage';
import { useNotificationPreference } from '../useNotificationPreference';

const mock = Notifications as unknown as typeof Notifications & {
  __permission: (status: 'granted' | 'undetermined' | 'denied', canAskAgain?: boolean) => Notifications.NotificationPermissionsStatus;
};
const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;

const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

async function renderPreference() {
  const hook = await renderHook(() => ({ pref: useNotificationPreference(), settings: useSettings() }), { wrapper });
  await waitFor(() => expect(hook.result.current.settings.loaded).toBe(true));
  await waitFor(() => expect(hook.result.current.pref.permission).not.toBeNull());
  return hook;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  getPermissions.mockImplementation(async () => mock.__permission('granted'));
  requestPermissions.mockImplementation(async () => mock.__permission('granted'));
});

afterEach(() => jest.restoreAllMocks());

describe('useNotificationPreference', () => {
  it('con permiso ya concedido, activarlas solo guarda la preferencia', async () => {
    const { result } = await renderPreference();

    await act(() => result.current.pref.setEnabled(true));

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(result.current.pref.enabled).toBe(true);
    await expect(loadSettings()).resolves.toMatchObject({ notificationsEnabled: true });
  });

  it('sin permiso todavía: lo pide y, si lo concede, las activa', async () => {
    getPermissions.mockImplementation(async () => mock.__permission('undetermined'));
    const { result } = await renderPreference();

    await act(() => result.current.pref.setEnabled(true));

    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(result.current.pref.permission).toBe('granted');
    expect(result.current.pref.enabled).toBe(true);
  });

  it('si rechaza el permiso, no se activan y explica por qué', async () => {
    getPermissions.mockImplementation(async () => mock.__permission('undetermined'));
    requestPermissions.mockImplementation(async () => mock.__permission('denied', true));
    const { result } = await renderPreference();

    await act(() => result.current.pref.setEnabled(true));

    expect(result.current.pref.enabled).toBe(false);
    expect(result.current.pref.message).toBe('Sin permiso no podemos enviarte notificaciones.');
    await expect(loadSettings()).resolves.toMatchObject({ notificationsEnabled: false });
  });

  it('permiso bloqueado: no muestra el diálogo y guía a Ajustes', async () => {
    getPermissions.mockImplementation(async () => mock.__permission('denied', false));
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { result } = await renderPreference();

    await act(() => result.current.pref.setEnabled(true));

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(result.current.pref.permission).toBe('blocked');
    expect(result.current.pref.message).toMatch(/ajustes del teléfono/);

    await act(() => result.current.pref.openSettings());
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('desactivarlas guarda la preferencia sin consultar el permiso', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true }));
    const { result } = await renderPreference();
    getPermissions.mockClear();

    await act(() => result.current.pref.setEnabled(false));

    expect(getPermissions).not.toHaveBeenCalled();
    expect(result.current.pref.enabled).toBe(false);
    await expect(loadSettings()).resolves.toMatchObject({ notificationsEnabled: false });
  });

  it('detecta si el permiso se quitó desde los ajustes del teléfono', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true }));
    getPermissions.mockImplementation(async () => mock.__permission('denied', false));
    const { result } = await renderPreference();

    expect(result.current.pref.enabled).toBe(false);
    expect(result.current.pref.revoked).toBe(true);
  });

  it('vuelve a revisar el permiso al regresar a la app', async () => {
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true }));
    const { result } = await renderPreference();
    expect(result.current.pref.revoked).toBe(false);

    // El usuario quita el permiso en Ajustes y vuelve a la app.
    getPermissions.mockImplementation(async () => mock.__permission('denied', false));
    await act(async () => listeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(result.current.pref.revoked).toBe(true));
  });

  describe('notificación de prueba', () => {
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

    it('la envía y avisa que se envió', async () => {
      const { result } = await renderPreference();
      expect(result.current.pref.testStatus).toBe('idle');

      await act(() => result.current.pref.sendTest());

      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule.mock.calls[0][0].content.title).toBe('Notificación de prueba');
      expect(result.current.pref.testStatus).toBe('sent');
    });

    it('usa la preferencia de vibración vigente', async () => {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled: true, vibrationEnabled: false }));
      const { result } = await renderPreference();

      await act(() => result.current.pref.sendTest());

      expect(schedule.mock.calls[0][0].content.sound).toBe(false);
    });

    it('informa si no se pudo enviar', async () => {
      schedule.mockRejectedValueOnce(new Error('sin permiso'));
      const { result } = await renderPreference();

      await act(() => result.current.pref.sendTest());

      expect(result.current.pref.testStatus).toBe('error');
    });
  });
});
