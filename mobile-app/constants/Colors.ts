// ============================================================
// TransitHub — Design System Colors (Mobile)
// Matches the web frontend's dark-mode palette in index.css
// ============================================================

const palette = {
  // Primary
  primary50:  '#E8F1FF',
  primary100: '#C6DBFF',
  primary200: '#8DB8FF',
  primary300: '#5A96F5',
  primary400: '#3B7ADB',
  primary500: '#1D5FBA',
  primary600: '#164D99',
  primary700: '#103C78',
  primary800: '#0A2B57',
  primary900: '#061B38',

  // Status
  success:   '#22C55E',
  warning:   '#EAB308',
  danger:    '#EF4444',
  info:      '#0EA5E9',

  // Occupancy
  occupancyLow:    '#22C55E',
  occupancyMedium: '#EAB308',
  occupancyHigh:   '#F97316',
  occupancyFull:   '#EF4444',

  // Dark surfaces (matches web --color-bg, surface-1, etc.)
  bgDeep:    '#0F1318',
  surface1:  '#171C24',
  surface2:  '#1E2530',
  surface3:  '#283040',
  border:    '#313D50',

  // Text
  textPrimary:   '#F0F3F8',
  textSecondary: '#94A3B8',
  textMuted:     '#64748B',

  // Accent gradients
  gradientStart: '#3B82F6',
  gradientEnd:   '#6366F1',
};

export default {
  light: {
    ...palette,
    text:             '#0F172A',
    textSecondary:    '#475569',
    textMuted:        '#94A3B8',
    background:       '#F8FAFC',
    surface:          '#FFFFFF',
    surfaceElevated:  '#F1F5F9',
    border:           '#E2E8F0',
    tint:             palette.primary400,
    tabIconDefault:   '#94A3B8',
    tabIconSelected:  palette.primary400,
  },
  dark: {
    ...palette,
    text:             palette.textPrimary,
    background:       palette.bgDeep,
    surface:          palette.surface1,
    surfaceElevated:  palette.surface2,
    tint:             palette.primary300,
    tabIconDefault:   palette.textMuted,
    tabIconSelected:  palette.primary300,
  },
};
