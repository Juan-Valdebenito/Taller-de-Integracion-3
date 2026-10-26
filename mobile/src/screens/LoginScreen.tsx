import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import type { LoginInput } from '../auth/types';
import { hasErrors, validateLogin, type FieldErrors } from '../auth/validation';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useCooldown } from '../hooks/useCooldown';
import { spacing } from '../theme';

export function LoginScreen() {
  const router = useRouter();
  const { signIn, restoreError, signOutNotice, retryRestore } = useAuth();
  const cooldown = useCooldown();
  const passwordRef = useRef<TextInputInstance>(null);

  const [form, setForm] = useState<LoginInput>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginInput>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof LoginInput) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
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
      subtitle="Revisa en tiempo real dónde vienen las micros."
      message={notice}
      messageTone={isWarning ? 'warning' : 'error'}
    >
      <TextField
        label="Correo electrónico"
        value={form.email}
        onChangeText={update('email')}
        error={fieldErrors.email}
        placeholder="nombre@correo.cl"
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
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={styles.actions}>
        <Button
          title={cooldown.active ? `Espera ${cooldown.secondsLeft} s` : 'Iniciar sesión'}
          onPress={submit}
          loading={submitting}
          disabled={cooldown.active}
        />
        {restoreError && !message ? <Button title="Reintentar conexión" variant="secondary" onPress={retryRestore} /> : null}
        <Button title="¿No tienes cuenta? Regístrate" variant="secondary" onPress={() => router.push('/register')} />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
