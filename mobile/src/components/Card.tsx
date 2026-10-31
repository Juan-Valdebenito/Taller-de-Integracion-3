import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radius, spacing } from '../theme';

export interface CardProps {
  children: ReactNode;
  /**
   * Tarjeta destacada, como la de login y registro del web (radio --radius-xl,
   * padding --space-8 y sombra). La normal es la de los paneles y el dashboard.
   */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Tarjeta del web: --color-surface-1 con borde --color-border. */
export function Card({ children, elevated = false, style, testID }: CardProps) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.card, elevated ? styles.elevated : null, style]}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  elevated: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
  },
}));
