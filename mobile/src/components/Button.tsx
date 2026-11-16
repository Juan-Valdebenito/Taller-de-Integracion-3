import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** primary: azul · secondary: texto · danger: rojo (acciones destructivas como cerrar sesión) */
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * Texto mientras carga, como el web ("Verificando..." con opacidad 0.7). Sin
   * él se muestra un indicador de actividad.
   */
  loadingTitle?: string;
}

export function Button({ title, onPress, loading = false, disabled = false, variant = 'primary', loadingTitle }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;
  const primary = variant !== 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && loadingTitle ? loadingTitle : title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'danger' ? styles.danger : primary ? styles.primary : styles.secondary,
        pressed && variant === 'primary' ? styles.primaryPressed : null,
        pressed && variant === 'danger' ? styles.dangerPressed : null,
        pressed && variant === 'secondary' ? styles.secondaryPressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <View style={styles.loadingContent}>
          <ActivityIndicator size="small" color={variant === 'danger' ? colors.onDanger : primary ? colors.onPrimary : colors.accent} />
          {loadingTitle ? <Text style={[styles.text, variant === 'danger' ? styles.textDanger : primary ? styles.textPrimary : styles.textSecondary]}>{loadingTitle}</Text> : null}
        </View>
      ) : (
        <Text style={[styles.text, variant === 'danger' ? styles.textDanger : primary ? styles.textPrimary : styles.textSecondary]}>
          {loading && loadingTitle ? loadingTitle : title}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors, font) => ({
  // Botón del web: padding 12, radio 8, texto 700. Alto mínimo de 44 para el dedo.
  base: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  danger: { backgroundColor: colors.danger },
  dangerPressed: { backgroundColor: colors.dangerPressed },
  secondary: { backgroundColor: 'transparent' },
  secondaryPressed: { backgroundColor: colors.field },
  disabled: { opacity: 0.7 },
  text: { fontSize: font(14), fontWeight: '700' },
  textPrimary: { color: colors.onPrimary },
  textDanger: { color: colors.onDanger },
  textSecondary: { color: colors.accent },
  loadingContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
}));
