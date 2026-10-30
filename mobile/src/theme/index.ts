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

export { applyInter, interFamily, INTER_FAMILIES } from './typography';
export {
  BRAND_GRADIENT,
  BUS_STATUS,
  OCCUPANCY_COLORS,
  occupancyColor,
  occupancyLevel,
  type BusStatus,
  type OccupancyLevel,
} from './status';

/** Espaciados (los mismos pasos que --space-* del frontend web). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

/** Radios de las esquinas, iguales a --radius-* del frontend web. */
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 };
