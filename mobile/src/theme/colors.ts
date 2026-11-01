/**
 * Paletas de la app (mismo azul que el frontend web). Todos los pares de texto
 * y fondo que se usan cumplen contraste WCAG AA (≥ 4.5:1); ver colors.test.ts.
 */
export interface ThemeColors {
  primary: string;
  primaryPressed: string;
  /** Texto e íconos sobre fondo `primary` (botones, avatar, opción elegida). */
  onPrimary: string;
  text: string;
  muted: string;
  border: string;
  background: string;
  surface: string;
  danger: string;
  dangerPressed: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  successBg: string;
}

export const lightColors: Readonly<ThemeColors> = Object.freeze({
  primary: '#1d4ed8',
  primaryPressed: '#1e40af',
  onPrimary: '#ffffff',
  text: '#111827',
  muted: '#4b5563',
  border: '#d1d5db',
  background: '#ffffff',
  surface: '#f3f4f6',
  danger: '#b91c1c',
  dangerPressed: '#991b1b',
  dangerBg: '#fef2f2',
  warning: '#b45309',
  warningBg: '#fffbeb',
  successBg: '#ecfdf5',
});

/** En oscuro el azul se aclara (y el texto sobre él se oscurece) para mantener el contraste. */
export const darkColors: Readonly<ThemeColors> = Object.freeze({
  primary: '#60a5fa',
  primaryPressed: '#93c5fd',
  onPrimary: '#0b1220',
  text: '#f3f4f6',
  muted: '#9ca3af',
  border: '#374151',
  background: '#0b1220',
  surface: '#1f2937',
  danger: '#f87171',
  dangerPressed: '#fca5a5',
  dangerBg: '#3b1414',
  warning: '#fbbf24',
  warningBg: '#33240a',
  successBg: '#0d2a1f',
});
