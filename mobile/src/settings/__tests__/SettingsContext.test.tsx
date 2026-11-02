import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SettingsProvider, useSettings } from '../SettingsContext';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings } from '../settingsStorage';

const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

async function renderSettings() {
  const hook = await renderHook(() => useSettings(), { wrapper });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('SettingsContext', () => {
  it('sin preferencias guardadas parte con los valores por defecto', async () => {
    const { result } = await renderSettings();
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('carga las preferencias guardadas al iniciar', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark', textSize: 'large' }));
    const { result } = await renderSettings();

    expect(result.current.settings).toMatchObject({ theme: 'dark', textSize: 'large', notificationsEnabled: false });
  });

  it('un cambio se aplica al instante y queda guardado', async () => {
    const { result } = await renderSettings();

    await act(() => result.current.updateSettings({ theme: 'dark' }));

    expect(result.current.settings.theme).toBe('dark');
    await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
  });

  it('cambios seguidos no se pisan: se guarda el último estado completo', async () => {
    const { result } = await renderSettings();

    await act(async () => {
      result.current.updateSettings({ theme: 'dark' });
      result.current.updateSettings({ textSize: 'extraLarge' });
      await result.current.updateSettings({ vibrationEnabled: false });
    });

    const expected = { ...DEFAULT_SETTINGS, theme: 'dark', textSize: 'extraLarge', vibrationEnabled: false };
    expect(result.current.settings).toEqual(expected);
    await expect(loadSettings()).resolves.toEqual(expected);
  });

  it('restablece los valores por defecto', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark', notificationsEnabled: true }));
    const { result } = await renderSettings();

    await act(() => result.current.resetSettings());

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('si no se puede guardar, aplica el cambio igual y avisa', async () => {
    const { result } = await renderSettings();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    await act(() => result.current.updateSettings({ theme: 'light' }));

    expect(result.current.settings.theme).toBe('light');
    expect(result.current.saveError).toMatch(/No se pudo guardar/);

    await act(() => result.current.updateSettings({ theme: 'dark' }));
    expect(result.current.saveError).toBeNull();
  });

  it('fuera del provider lanza un error claro', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useSettings())).rejects.toThrow('useSettings debe usarse dentro de <SettingsProvider>');
    spy.mockRestore();
  });
});
