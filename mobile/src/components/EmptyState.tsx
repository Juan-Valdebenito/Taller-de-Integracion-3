import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, spacing } from '../theme';

export interface EmptyStateProps {
  /**
   * Emoji grande que ilustra el estado vacío.
   * Usar un emoji neutral que no sea ambiguo (📭, 🔍, 📋, 🚍, etc.).
   */
  emoji?: string;
  /** Título corto del estado vacío. */
  title: string;
  /** Texto de apoyo opcional con más contexto. */
  description?: string;
  /** Nodo adicional (ej. un botón «Crear el primero»). */
  action?: ReactNode;
  /** Si se pasa, muestra un botón «{actionLabel}» en lugar de `action`. */
  onAction?: () => void;
  actionLabel?: string;
}

/**
 * Estado vacío reutilizable: emoji + título + descripción opcional + acción.
 * Sustituye el texto plano `<Text>No se encontraron X</Text>` que aparece en
 * varias pantallas, dando más contexto al usuario y una acción rápida.
 *
 * Accesibilidad:
 * - El título se anuncia como encabezado y el emoji decorativo se oculta.
 * - El botón de acción tiene una etiqueta y un área táctil de al menos 44 px.
 */
export function EmptyState({ emoji = '📭', title, description, action, onAction, actionLabel }: EmptyStateProps) {
  const styles = useStyles();
  if (!title.trim()) return null;
  return (
    <View style={styles.container}>
      {emoji ? (
        <Text style={styles.emoji} importantForAccessibility="no" accessibilityElementsHidden>
          {emoji}
        </Text>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ?? null}
      {onAction && actionLabel && !action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint="Realiza la acción para continuar desde este estado vacío"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 1.5,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emoji: {
    fontSize: 48,
    lineHeight: 60,
  },
  title: {
    marginTop: spacing.xs,
    fontSize: font(18),
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: font(14),
    lineHeight: font(20),
    color: colors.muted,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: font(14),
    fontWeight: '600',
  },
}));

