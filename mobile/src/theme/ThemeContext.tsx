import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { useSettings } from '../settings/SettingsContext';
import type { TextSizePreference, ThemePreference } from '../settings/settingsStorage';
import { darkColors, lightColors, type ThemeColors } from './colors';

export type ColorScheme = 'light' | 'dark';

/**
 * Multiplicador de cada tamaño de texto. Se suma al tamaño de letra del
 * teléfono (Ajustes > Accesibilidad), que React Native ya respeta.
 */
export const TEXT_SCALES: Readonly<Record<TextSizePreference, number>> = Object.freeze({
  normal: 1,
  large: 1.15,
  extraLarge: 1.3,
});

/** Escala un tamaño de fuente (o de interlineado) según el tamaño de texto elegido. */
export type FontScaler = (size: number) => number;

export interface Theme {
  scheme: ColorScheme;
  colors: Readonly<ThemeColors>;
  textSize: TextSizePreference;
  font: FontScaler;
}

/** Tema efectivo: la preferencia del pasajero, o el modo del teléfono si eligió "Sistema". */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Un objeto por combinación (2 temas × 3 tamaños): así los estilos se pueden reutilizar. */
const themes = new Map<string, Theme>();

export function themeFor(scheme: ColorScheme, textSize: TextSizePreference = 'normal'): Theme {
  const key = `${scheme}:${textSize}`;
  let theme = themes.get(key);
  if (!theme) {
    const scale = TEXT_SCALES[textSize];
    theme = {
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      textSize,
      font: (size) => Math.round(size * scale),
    };
    themes.set(key, theme);
  }
  return theme;
}

// Sin provider (ej. tests de un componente suelto) se usa el tema claro y texto normal.
const ThemeContext = createContext<Theme>(themeFor('light'));

/**
 * Aplica el tema y el tamaño de texto elegidos en Configuración; con "Sistema"
 * sigue los cambios de modo claro/oscuro del teléfono en vivo.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const system = useColorScheme();
  const theme = themeFor(resolveScheme(settings.theme, system), settings.textSize);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Estilos que dependen del tema. Se crean una vez por combinación de tema y
 * tamaño de texto, y se reutilizan:
 *
 *   const useStyles = makeStyles((colors, font) => ({ title: { color: colors.text, fontSize: font(16) } }));
 *   function Componente() { const styles = useStyles(); ... }
 */
export function makeStyles<S extends NamedStyles>(
  // Misma firma que StyleSheet.create: "& NamedStyles" da el tipo de cada estilo
  // como contexto, así 'center' o '700' no se ensanchan a string.
  factory: (colors: Readonly<ThemeColors>, font: FontScaler) => S & NamedStyles,
): () => Readonly<S> {
  const cache = new Map<Theme, Readonly<S>>();
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => {
      const cached = cache.get(theme);
      if (cached) return cached;
      const styles = StyleSheet.create<S>(factory(theme.colors, theme.font));
      cache.set(theme, styles);
      return styles;
    }, [theme]);
  };
}

/** Objeto de estilos que acepta StyleSheet.create. */
type NamedStyles = Parameters<typeof StyleSheet.create>[0];
