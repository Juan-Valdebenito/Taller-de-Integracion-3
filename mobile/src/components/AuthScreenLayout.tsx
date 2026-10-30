import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles, radius, spacing } from '../theme';

export interface AuthScreenLayoutProps {
  title: string;
  subtitle: string;
  /** Mensaje general del formulario (error del servidor o límite de intentos). */
  message?: string | null;
  messageTone?: 'error' | 'warning';
  children: ReactNode;
}

/** Estructura común de Login y Registro: título, aviso y formulario con teclado seguro. */
export function AuthScreenLayout({ title, subtitle, message, messageTone = 'error', children }: AuthScreenLayoutProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>TransitHub</Text>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { fontSize: font(16), fontWeight: '700', color: colors.accent, marginBottom: spacing.sm },
  title: { fontSize: font(28), fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font(15), color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg },
  message: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  error: { backgroundColor: colors.dangerBg },
  warning: { backgroundColor: colors.warningBg },
  errorText: { color: colors.danger, fontSize: font(14) },
  warningText: { color: colors.warning, fontSize: font(14) },
}));
