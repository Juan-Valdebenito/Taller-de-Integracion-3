import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SettingsProvider, useSettings } from '../../settings/SettingsContext';
import { SETTINGS_KEY } from '../../settings/settingsStorage';
import { darkColors, lightColors } from '../colors';
import { navigationTheme } from '../navigationTheme';
import { ThemeProvider, makeStyles, resolveScheme, themeFor, useTheme } from '../ThemeContext';

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
    expect(result.current).toEqual({ scheme: 'light', colors: lightColors });
  });

  it('con "Sistema" sigue el modo oscuro del teléfono', async () => {
    systemScheme.mockReturnValue('dark');
    const { result } = await renderTheme();
    expect(result.current.theme).toEqual({ scheme: 'dark', colors: darkColors });
  });

  it('aplica la preferencia guardada aunque el teléfono esté en otro modo', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
    systemScheme.mockReturnValue('light');
    const { result } = await renderTheme();
    expect(result.current.theme.scheme).toBe('dark');
  });

  it('cambiar el tema en Configuración se aplica al instante', async () => {
    const { result } = await renderTheme();
    expect(result.current.theme.scheme).toBe('light');

    await act(() => result.current.settings.updateSettings({ theme: 'dark' }));
    expect(result.current.theme.colors).toBe(darkColors);

    await act(() => result.current.settings.updateSettings({ theme: 'light' }));
    expect(result.current.theme.colors).toBe(lightColors);
  });
});

describe('makeStyles', () => {
  const useStyles = makeStyles((colors) => ({ title: { color: colors.text, fontWeight: '700' } }));

  it('crea los estilos con los colores del tema vigente', async () => {
    systemScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useStyles(), { wrapper });
    await waitFor(() => expect(result.current.title.color).toBe(darkColors.text));
  });

  it('reutiliza los mismos estilos para la misma paleta', async () => {
    const first = (await renderHook(() => useStyles())).result.current;
    const second = (await renderHook(() => useStyles())).result.current;
    expect(second).toBe(first);
    expect(first.title.color).toBe(lightColors.text);
  });
});

describe('navigationTheme', () => {
  it('cabeceras y barra de pestañas con los colores de la app', () => {
    const nav = navigationTheme(themeFor('dark'));
    expect(nav.dark).toBe(true);
    expect(nav.colors).toMatchObject({
      primary: darkColors.primary,
      background: darkColors.background,
      card: darkColors.background,
      text: darkColors.text,
      border: darkColors.border,
    });
    expect(navigationTheme(themeFor('light')).dark).toBe(false);
  });
});
