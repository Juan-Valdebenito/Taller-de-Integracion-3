import { ActivityIndicator, Text, View } from 'react-native';

import { makeStyles, spacing, useTheme } from '../theme';

export interface LoadingStateProps {
  /** Texto que aparece bajo el indicador (por defecto «Cargando…»). */
  message?: string;
  /**
   * Tamaño del indicador (por defecto «large»).
   * Usa «small» cuando el estado vive dentro de una tarjeta o lista compacta.
   */
  size?: 'small' | 'large';
}

/**
 * Estado de carga reutilizable: ActivityIndicator con mensaje opcional.
 * Sustituye el patrón `<Text>Cargando X…</Text>` disperso por las pantallas.
 *
 * Accesibilidad:
 * - `accessibilityLiveRegion="polite"` anuncia el texto cuando aparece.
 * - `accessibilityRole="progressbar"` señala que es un indicador de progreso.
 */
export function LoadingState({ message = 'Cargando…', size = 'large' }: LoadingStateProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View
      style={size === 'large' ? styles.containerLarge : styles.containerSmall}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <ActivityIndicator size={size} color={colors.accent} style={styles.indicator} />
      <Text style={size === 'large' ? styles.textLarge : styles.textSmall}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  containerLarge: {
    paddingVertical: spacing.xl * 1.5,
    alignItems: 'center',
    gap: spacing.md,
  },
  containerSmall: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  indicator: {},
  textLarge: {
    color: colors.muted,
    fontSize: font(15),
    textAlign: 'center',
  },
  textSmall: {
    color: colors.muted,
    fontSize: font(13),
    textAlign: 'center',
  },
}));

