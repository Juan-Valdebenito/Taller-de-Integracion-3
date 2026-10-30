/**
 * Paletas de la app. La oscura (la predeterminada) usa los mismos colores que
 * el frontend web (frontend/src/index.css). Todos los pares de texto y fondo
 * que se usan cumplen contraste WCAG AA (≥ 4.5:1); ver colors.test.ts.
 */
export interface ThemeColors {
  /** Fondo de botones, opción elegida, avatar (con texto `onPrimary`). */
  primary: string;
  primaryPressed: string;
  /** Texto e íconos sobre fondo `primary` (botones, avatar, opción elegida). */
  onPrimary: string;
  /** Texto de enlaces y acentos (marca, botón secundario, pestaña activa). */
  accent: string;
  text: string;
  muted: string;
  border: string;
  background: string;
  /** Tarjetas y bloques sobre el fondo. */
  surface: string;
  /** Fondo de los campos de texto. */
  field: string;
  /** Texto de ejemplo dentro de los campos (más tenue que muted, como el web). */
  placeholder: string;
  danger: string;
  dangerPressed: string;
  /** Texto sobre fondo `danger` (botón de cerrar sesión). */
  onDanger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  successBg: string;
}

export const lightColors: Readonly<ThemeColors> = Object.freeze({
  primary: '#1d4ed8',
  primaryPressed: '#1e40af',
  onPrimary: '#ffffff',
  accent: '#1d4ed8',
  text: '#111827',
  muted: '#4b5563',
  border: '#d1d5db',
  background: '#ffffff',
  surface: '#f3f4f6',
  field: '#ffffff',
  placeholder: '#9ca3af',
  danger: '#b91c1c',
  dangerPressed: '#991b1b',
  onDanger: '#ffffff',
  dangerBg: '#fef2f2',
  warning: '#b45309',
  warningBg: '#fffbeb',
  successBg: '#ecfdf5',
});

/**
 * Colores del frontend web (index.css, en HSL, convertidos a #rrggbb):
 * fondo --color-bg, tarjetas --color-surface-1, campos --color-surface-2,
 * botón --color-primary-600, enlaces #38bdf8, error #f87171.
 */
export const darkColors: Readonly<ThemeColors> = Object.freeze({
  primary: '#1354ae',
  primaryPressed: '#0f428a',
  onPrimary: '#ffffff',
  accent: '#38bdf8',
  text: '#f0f1f5',
  muted: '#9da3af',
  border: '#373d49',
  background: '#101318',
  surface: '#191d24',
  field: '#22272f',
  placeholder: '#6a707c',
  danger: '#f87171',
  dangerPressed: '#fca5a5',
  onDanger: '#101318',
  dangerBg: '#392329',
  warning: '#fbbf24',
  warningBg: '#33240a',
  successBg: '#0d2a1f',
});
