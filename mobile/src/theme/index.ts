/** Tema de la app: paletas clara/oscura, espaciados y utilidades para estilos. */
export { darkColors, lightColors, type ThemeColors } from './colors';
export {
  TEXT_SCALES,
  ThemeProvider,
  makeStyles,
  resolveScheme,
  themeFor,
  useTheme,
  type ColorScheme,
  type FontScaler,
  type Theme,
} from './ThemeContext';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { md: 10, lg: 14 };
