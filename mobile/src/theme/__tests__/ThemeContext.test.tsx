import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SettingsProvider, useSettings } from '../../settings/SettingsContext';
import { SETTINGS_KEY } from '../../settings/settingsStorage';
import { darkColors, lightColors } from '../colors';
import { navigationTheme } from '../navigationTheme';
import { TEXT_SCALES, ThemeProvider, makeStyles, resolveScheme, themeFor, useTheme } from '../ThemeContext';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn(() => 'light') }));

// Modo del teléfono (claro/oscuro) simulado.
const systemScheme = jest.requireMock<{ default: jest.Mock<string | null> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

const wrapper = ({ children }: { children: ReactNode }) => (
  <SettingsProvider>
    <ThemeProvider>{children}</ThemeProvider>
  </SettingsProvider>
);

/** Tema y preferencias, esperando a que se lean las guardadas. */
async function renderTheme() {
  const hook = await renderHook(() => ({ theme: useTheme(), settings: useSettings() }), { wrapper });
  await waitFor(() => expect(hook.result.current.settings.loaded).toBe(true));
  return hook;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  systemScheme.mockReturnValue('light');
});

describe('resolveScheme', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['system', 'unspecified', 'light'],
  ] as const)('preferencia %s + teléfono %s → %s', (preference, system, expected) => {
    expect(resolveScheme(preference, system)).toBe(expected);
  });
});

describe('ThemeProvider', () => {
  it('sin provider usa el tema claro', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toMatchObject({ scheme: 'light', colors: lightColors, textSize: 'normal' });
    expect(result.current.font(16)).toBe(16);
  });

  it('con "Sistema" sigue el modo oscuro del teléfono', async () => {
    systemScheme.mockReturnValue('dark');
    const { result } = await renderTheme();
    expect(result.current.theme).toMatchObject({ scheme: 'dark', colors: darkColors });
  });

  it('aplica la preferencia guardada aunque el teléfono esté en otro modo', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
    systemScheme.mockReturnValue('light');
    const { result } = await renderTheme();
    expect(result.current.theme.scheme).toBe('dark');
  });

  it('cambiar el tema en Configuración se aplica al instante', async () => {
    // Por defecto oscuro, como el frontend web.
    const { result } = await renderTheme();
    expect(result.current.theme.scheme).toBe('dark');

    await act(() => result.current.settings.updateSettings({ theme: 'light' }));
    expect(result.current.theme.colors).toBe(lightColors);

    await act(() => result.current.settings.updateSettings({ theme: 'dark' }));
    expect(result.current.theme.colors).toBe(darkColors);
  });
});

describe('tamaño del texto', () => {
  it('multiplicadores: normal ×1, grande ×1.15, muy grande ×1.3', () => {
    expect(TEXT_SCALES).toEqual({ normal: 1, large: 1.15, extraLarge: 1.3 });
  });

  it.each([
    ['normal', 16, 16],
    ['large', 16, 18],
    ['extraLarge', 16, 21],
    ['extraLarge', 13, 17],
  ] as const)('%s: font(%p) = %p (redondeado)', (textSize, size, expected) => {
    expect(themeFor('light', textSize).font(size)).toBe(expected);
  });

  it('la misma combinación de tema y tamaño devuelve el mismo objeto', () => {
    expect(themeFor('dark', 'large')).toBe(themeFor('dark', 'large'));
    expect(themeFor('dark', 'large')).not.toBe(themeFor('dark', 'normal'));
  });

  it('aplica el tamaño guardado y los cambios en Configuración al instante', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ textSize: 'large' }));
    const { result } = await renderTheme();
    expect(result.current.theme.font(20)).toBe(23);

    await act(() => result.current.settings.updateSettings({ textSize: 'extraLarge' }));
    expect(result.current.theme.textSize).toBe('extraLarge');
    expect(result.current.theme.font(20)).toBe(26);
  });
});

describe('makeStyles', () => {
  const useStyles = makeStyles((colors) => ({ title: { color: colors.text, fontWeight: '700' } }));

  it('crea los estilos con los colores del tema vigente', async () => {
    systemScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useStyles(), { wrapper });
    await waitFor(() => expect(result.current.title.color).toBe(darkColors.text));
  });

  it('escala fontSize y lineHeight con el tamaño de texto elegido', async () => {
    const useText = makeStyles((colors, font) => ({ body: { fontSize: font(16), lineHeight: font(22), color: colors.text } }));
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ textSize: 'extraLarge' }));
    const { result } = await renderHook(() => ({ styles: useText(), settings: useSettings() }), { wrapper });
    await waitFor(() => expect(result.current.settings.loaded).toBe(true));

    expect(result.current.styles.body).toMatchObject({ fontSize: 21, lineHeight: 29 });
  });

  it('reutiliza los mismos estilos para la misma paleta', async () => {
    const first = (await renderHook(() => useStyles())).result.current;
    const second = (await renderHook(() => useStyles())).result.current;
    expect(second).toBe(first);
    expect(first.title.color).toBe(lightColors.text);
  });

  it('aplica Inter con el grosor de cada estilo de texto (como el web)', async () => {
    const { result } = await renderHook(() => useStyles());
    expect(result.current.title).toEqual({ color: lightColors.text, fontFamily: 'Inter_700Bold' });
  });
});

describe('navigationTheme', () => {
  it('cabeceras y barra de pestañas con los colores de la app', () => {
    const nav = navigationTheme(themeFor('dark'));
    expect(nav.dark).toBe(true);
    expect(nav.colors).toMatchObject({
      // primary de React Navigation tiñe textos (atrás, pestaña activa): accent.
      primary: darkColors.accent,
      background: darkColors.background,
      card: darkColors.background,
      text: darkColors.text,
      border: darkColors.border,
    });
    expect(navigationTheme(themeFor('light')).dark).toBe(false);
  });
});
