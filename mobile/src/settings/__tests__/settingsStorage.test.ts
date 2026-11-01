import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, parseSettings, saveSettings } from '../settingsStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('parseSettings', () => {
  it('sin datos guardados usa los valores por defecto', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('por defecto las notificaciones están desactivadas y el tema sigue al sistema', () => {
    expect(DEFAULT_SETTINGS).toEqual({ notificationsEnabled: false, vibrationEnabled: true, theme: 'dark', textSize: 'normal' });
  });

  it('lee preferencias válidas', () => {
    const raw = JSON.stringify({ version: 1, notificationsEnabled: true, vibrationEnabled: false, theme: 'dark', textSize: 'large' });
    expect(parseSettings(raw)).toEqual({ notificationsEnabled: true, vibrationEnabled: false, theme: 'dark', textSize: 'large' });
  });

  it('un campo inválido vuelve a su valor por defecto sin perder el resto', () => {
    const raw = JSON.stringify({ notificationsEnabled: 'sí', vibrationEnabled: false, theme: 'violeta', textSize: 'extraLarge' });
    expect(parseSettings(raw)).toEqual({ notificationsEnabled: false, vibrationEnabled: false, theme: 'dark', textSize: 'extraLarge' });
  });

  it.each(['{no es json', 'null', '42', '"texto"'])('datos dañados (%p) → valores por defecto', (raw) => {
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('devuelve una copia: modificarla no altera los valores por defecto', () => {
    const settings = parseSettings(null);
    settings.theme = 'light';
    expect(DEFAULT_SETTINGS.theme).toBe('dark');
  });
});

describe('loadSettings / saveSettings', () => {
  it('guarda y vuelve a leer las preferencias', async () => {
    const settings = { notificationsEnabled: true, vibrationEnabled: true, theme: 'light' as const, textSize: 'extraLarge' as const };
    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
    expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toEqual({ version: 1, ...settings });
  });

  it('si el almacenamiento falla al leer, usa los valores por defecto', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('disk error'));
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});
