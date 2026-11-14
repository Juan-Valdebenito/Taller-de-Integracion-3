import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { makeStyles, radius, spacing } from '../theme';

export interface ToastBannerProps {
  /** Mensaje a mostrar. `null` / `undefined` → no se renderiza nada. */
  message: string | null | undefined;
  /**
   * Tono del toast:
   * - `'success'` (por defecto) → degradado verde con checkmark.
   * - `'error'` → fondo dangerBg con texto de peligro (sin degradado).
   * - `'warning'` → fondo warningBg con texto de alerta.
   */
  tone?: 'success' | 'error' | 'warning';
}

/**
 * Banner de retroalimentación reutilizable.
 *
 * Consolida los tres patrones de toast/aviso dispersos en la app:
 * 1. `LinearGradient` verde (éxito) → se seguirá usando para ese caso.
 * 2. Banner de error ad-hoc → usa este componente con `tone="error"`.
 * 3. Aviso de advertencia → usa este componente con `tone="warning"`.
 *
 * Accesibilidad:
 * - `accessibilityRole="alert"` anuncia el mensaje nada más aparecer.
 * - `accessibilityLiveRegion="assertive"` para errores / advertencias;
 *   `"polite"` para éxitos que no interrumpen el flujo del usuario.
 */
export function ToastBanner({ message, tone = 'success' }: ToastBannerProps) {
  const styles = useStyles();

  if (!message) return null;

  if (tone === 'success') {
    return (
      <LinearGradient
        colors={['#1f9d4f', '#167a3c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.successToast}
      >
        <Ionicons name="checkmark-circle" size={18} color="#ffffff" importantForAccessibility="no" />
        <Text style={styles.successText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {message}
        </Text>
      </LinearGradient>
    );
  }

  if (tone === 'warning') {
    return (
      <View style={styles.warningToast} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Ionicons name="warning-outline" size={18} color={undefined} style={styles.warningIcon} importantForAccessibility="no" />
        <Text style={styles.warningText}>{message}</Text>
      </View>
    );
  }

  // tone === 'error'
  return (
    <View style={styles.errorToast} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Ionicons name="alert-circle-outline" size={18} color={undefined} style={styles.errorIcon} importantForAccessibility="no" />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  // ── Éxito ──────────────────────────────────────────────────────────────────
  successToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  successText: {
    flex: 1,
    color: '#ffffff',
    fontSize: font(14),
    fontWeight: '600',
  },
  // ── Advertencia ───────────────────────────────────────────────────────────
  warningToast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: colors.warningBg,
  },
  warningIcon: {
    color: colors.warning,
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontSize: font(14),
    lineHeight: font(20),
  },
  // ── Error ─────────────────────────────────────────────────────────────────
  errorToast: {
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
  errorIcon: {
    color: colors.danger,
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: font(14),
    lineHeight: font(20),
  },
}));

