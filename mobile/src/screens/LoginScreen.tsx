import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import type { LoginInput } from '../auth/types';
import { hasErrors, validateLogin, type FieldErrors } from '../auth/validation';
import { AuthFooterLink } from '../components/AuthFooterLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { Button } from '../components/Button';
import { DemoAccounts } from '../components/DemoAccounts';
import { TextField } from '../components/TextField';
import { useCooldown } from '../hooks/useCooldown';
import { spacing } from '../theme';

export function LoginScreen() {
  const router = useRouter();
  const { signIn, restoreError, restoreRetryAfter, signOutNotice, retryRestore } = useAuth();
  const cooldown = useCooldown();
  // Espera aparte para "Reintentar conexión": el 429 al recuperar la sesión
  // viene del límite de renovación de tokens, no del de login, así que el
  // formulario sigue disponible.
  const restoreCooldown = useCooldown();
  const startRestoreCooldown = restoreCooldown.start;

  useEffect(() => {
    if (restoreRetryAfter) {
      startRestoreCooldown(restoreRetryAfter);
    }
  }, [restoreRetryAfter, startRestoreCooldown]);
  const passwordRef = useRef<TextInputInstance>(null);

  const [form, setForm] = useState<LoginInput>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginInput>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof LoginInput) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  // Como en el web: rellena el formulario con una cuenta de prueba y limpia el error.
  const fillDemo = (email: string, password: string) => {
    setForm({ email, password });
    setFieldErrors({});
    setMessage(null);
  };

  const submit = async () => {
    const errors = validateLogin(form);
    setFieldErrors(errors);
    setMessage(null);
    if (hasErrors(errors) || cooldown.active) {
      return;
    }
    setSubmitting(true);
    try {
      await signIn(form);
      // Stack.Protected lleva al inicio al cambiar la sesión.
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        cooldown.start(error.retryAfter ?? 60);
      }
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors as FieldErrors<LoginInput>);
      }
      setMessage(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  // Error del último intento; si no hay, los avisos de "no se pudo recuperar la
  // sesión" o "el cierre de sesión no se confirmó con el servidor".
  const notice = message ?? restoreError ?? signOutNotice;
  const isWarning = cooldown.active || (!message && Boolean(restoreError ?? signOutNotice));
  return (
    <AuthScreenLayout
      title="Iniciar sesión"
      subtitle="Ingresa tus credenciales protegidas con hash bcrypt"
      message={notice}
      messageTone={isWarning ? 'warning' : 'error'}
    >
      <TextField
        label="Correo electrónico"
        value={form.email}
        onChangeText={update('email')}
        error={fieldErrors.email}
        placeholder="ejemplo@transporte.cl"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Contraseña"
        value={form.password}
        onChangeText={update('password')}
        error={fieldErrors.password}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={styles.actions}>
        <Button
          title={cooldown.active ? `Espera ${cooldown.secondsLeft} s` : 'Entrar'}
          loadingTitle="Verificando..."
          onPress={submit}
          loading={submitting}
          disabled={cooldown.active}
        />
        {restoreError && !message ? (
          <Button
            title={restoreCooldown.active ? `Reintentar en ${restoreCooldown.secondsLeft} s` : 'Reintentar conexión'}
            variant="secondary"
            onPress={retryRestore}
            disabled={restoreCooldown.active}
          />
        ) : null}
      </View>
      <DemoAccounts onFill={fillDemo} />
      <AuthFooterLink prompt="¿No tienes cuenta?" link="Regístrate aquí" onPress={() => router.push('/register')} />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  // Web: el botón "Entrar" queda 8 px bajo el último campo.
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
