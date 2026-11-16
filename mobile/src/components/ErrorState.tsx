import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, spacing } from '../theme';

export interface ErrorStateProps {
  /** Mensaje de error a mostrar. */
  message: string;
  /** Si se pasa, muestra un botón «Reintentar» que llama a esta función. */
  onRetry?: () => void;
  /** Texto del botón de reintento (por defecto «Reintentar»). */
  retryLabel?: string;
}

/**
 * Estado de error reutilizable: banner con icono, mensaje y botón opcional de
 * reintento. Sustituye el patrón ad-hoc con `dangerBg` + `colors.danger`
 * disperso por las pantallas, garantizando colores y contrastes del tema.
 *
 * Accesibilidad:
 * - `accessibilityRole="alert"` anuncia el mensaje nada más aparecer.
 * - El botón de reintento tiene `accessibilityRole="button"` y etiqueta clara.
 */
export function ErrorState({ message, onRetry, retryLabel = 'Reintentar' }: ErrorStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
        ⚠️
      </Text>
      <View style={styles.body}>
        <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {message}
        </Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            accessibilityHint="Vuelve a intentar la acción que produjo el error"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            hitSlop={8}
          >
            <Text style={styles.buttonText}>{retryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: colors.dangerBg,
  },
  icon: {
    fontSize: font(16),
    lineHeight: font(24),
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  message: {
    color: colors.danger,
    fontSize: font(14),
    lineHeight: font(20),
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.danger,
    fontSize: font(13),
    fontWeight: '600',
  },
}));

