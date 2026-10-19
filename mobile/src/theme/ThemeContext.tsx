import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { useSettings } from '../settings/SettingsContext';
import type { ThemePreference } from '../settings/settingsStorage';
import { darkColors, lightColors, type ThemeColors } from './colors';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: Readonly<ThemeColors>;
}

/** Tema efectivo: la preferencia del pasajero, o el modo del teléfono si eligió "Sistema". */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function themeFor(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}

const LIGHT_THEME: Theme = { scheme: 'light', colors: lightColors };
const DARK_THEME: Theme = { scheme: 'dark', colors: darkColors };

// Sin provider (ej. tests de un componente suelto) se usa el tema claro.
const ThemeContext = createContext<Theme>(LIGHT_THEME);

/** Aplica el tema elegido en Configuración; con "Sistema" sigue los cambios del teléfono en vivo. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const system = useColorScheme();
  const theme = themeFor(resolveScheme(settings.theme, system));
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Estilos que dependen del tema. Se crean una vez por paleta y se reutilizan:
 *
 *   const useStyles = makeStyles((colors) => ({ title: { color: colors.text } }));
 *   function Componente() { const styles = useStyles(); ... }
 */
export function makeStyles<S extends NamedStyles>(
  // Misma firma que StyleSheet.create: "& NamedStyles" da el tipo de cada estilo
  // como contexto, así 'center' o '700' no se ensanchan a string.
  factory: (colors: Readonly<ThemeColors>) => S & NamedStyles,
): () => Readonly<S> {
  const cache = new Map<Readonly<ThemeColors>, Readonly<S>>();
  return function useStyles() {
    const { colors } = useTheme();
    return useMemo(() => {
      const cached = cache.get(colors);
      if (cached) return cached;
      const styles = StyleSheet.create<S>(factory(colors));
      cache.set(colors, styles);
      return styles;
    }, [colors]);
  };
}

/** Objeto de estilos que acepta StyleSheet.create. */
type NamedStyles = Parameters<typeof StyleSheet.create>[0];
