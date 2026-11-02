import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles, radius, spacing } from '../theme';
import { Card } from './Card';

export interface AuthScreenLayoutProps {
  title: string;
  subtitle: string;
  /** Mensaje general del formulario (error del servidor o límite de intentos). */
  message?: string | null;
  messageTone?: 'error' | 'warning';
  children: ReactNode;
}

/**
 * Estructura de Login y Registro, igual al AuthLayout del web: encabezado
 * centrado (🚌, TransitHub y bajada) y el formulario en una tarjeta de 400 px
 * como máximo, con teclado seguro.
 */
export function AuthScreenLayout({ title, subtitle, message, messageTone = 'error', children }: AuthScreenLayoutProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <View style={styles.header}>
              <Text style={styles.logo} importantForAccessibility="no" accessibilityElementsHidden>
                🚌
              </Text>
              <Text style={styles.brand}>TransitHub</Text>
              <Text style={styles.tagline}>Plataforma de Transporte Público Urbano</Text>
            </View>
            <Card elevated>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              {message ? (
                <View
                  style={[styles.message, messageTone === 'warning' ? styles.warning : styles.error]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  <Text style={messageTone === 'warning' ? styles.warningText : styles.errorText}>{message}</Text>
                </View>
              ) : null}
              {children}
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Medidas del web: AuthLayout (3rem, 2xl/800, sm) y la tarjeta de LoginPage.
// lineHeight = 1.6 × fontSize, el line-height del body del web.
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: font(48), lineHeight: font(77) },
  brand: { fontSize: font(24), lineHeight: font(38), fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  tagline: { fontSize: font(14), lineHeight: font(22), color: colors.muted, textAlign: 'center' },
  title: { fontSize: font(20), lineHeight: font(32), fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: font(14), lineHeight: font(22), color: colors.muted, marginBottom: spacing.lg },
  // Aviso de error del web: fondo rojo al 15 %, borde al 30 %, texto #f87171.
  message: { borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginBottom: spacing.md, borderWidth: 1 },
  error: { backgroundColor: colors.dangerBg, borderColor: 'rgba(239, 68, 68, 0.3)' },
  warning: { backgroundColor: colors.warningBg, borderColor: 'rgba(245, 158, 11, 0.3)' },
  errorText: { color: colors.danger, fontSize: font(13), lineHeight: font(21) },
  warningText: { color: colors.warning, fontSize: font(13), lineHeight: font(21) },
}));
