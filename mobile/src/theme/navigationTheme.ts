import { DarkTheme, DefaultTheme } from 'expo-router';

import type { Theme } from './ThemeContext';

/**
 * Tema de React Navigation (cabeceras, barra de pestañas y fondo entre
 * pantallas) a partir del tema de la app.
 */
export function navigationTheme({ scheme, colors }: Theme): typeof DefaultTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}
