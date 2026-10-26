import { ActivityIndicator, Pressable, Text } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** primary: azul · secondary: texto · danger: rojo (acciones destructivas como cerrar sesión) */
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ title, onPress, loading = false, disabled = false, variant = 'primary' }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;
  const primary = variant !== 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'danger' ? styles.danger : primary ? styles.primary : styles.secondary,
        pressed && variant === 'primary' ? styles.primaryPressed : null,
        pressed && variant === 'danger' ? styles.dangerPressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.text, primary ? styles.textPrimary : styles.textSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors, font) => ({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  danger: { backgroundColor: colors.danger },
  dangerPressed: { backgroundColor: colors.dangerPressed },
  secondary: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.6 },
  text: { fontSize: font(16), fontWeight: '600' },
  textPrimary: { color: colors.onPrimary },
  textSecondary: { color: colors.primary },
}));
