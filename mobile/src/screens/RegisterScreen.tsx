import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { MIN_PASSWORD_LENGTH, hasErrors, validateRegister, type FieldErrors, type RegisterFormInput } from '../auth/validation';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useCooldown } from '../hooks/useCooldown';
import { spacing } from '../theme';

const EMPTY_FORM: RegisterFormInput = { name: '', email: '', password: '', confirmPassword: '' };

export function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const cooldown = useCooldown();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const [form, setForm] = useState<RegisterFormInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterFormInput>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof RegisterFormInput) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    const errors = validateRegister(form);
    setFieldErrors(errors);
    setMessage(null);
    if (hasErrors(errors) || cooldown.active) {
      return;
    }
    setSubmitting(true);
    try {
      const { name, email, password } = form;
      await signUp({ name, email, password });
      // Stack.Protected lleva al inicio al cambiar la sesión.
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        cooldown.start(error.retryAfter ?? 60);
      }
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors as FieldErrors<RegisterFormInput>);
      }
      setMessage(error instanceof ApiError ? error.message : 'No se pudo crear la cuenta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreenLayout
      title="Crear cuenta"
      subtitle="Regístrate como pasajero para seguir tus micros y enviar reclamos."
      message={message}
      messageTone={cooldown.active ? 'warning' : 'error'}
    >
      <TextField
        label="Nombre"
        value={form.name}
        onChangeText={update('name')}
        error={fieldErrors.name}
        placeholder="Tu nombre"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
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
        placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Confirmar contraseña"
        value={form.confirmPassword}
        onChangeText={update('confirmPassword')}
        error={fieldErrors.confirmPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={styles.actions}>
        <Button
          title={cooldown.active ? `Espera ${cooldown.secondsLeft} s` : 'Crear cuenta'}
          onPress={submit}
          loading={submitting}
          disabled={cooldown.active}
        />
        <Button
          title="¿Ya tienes cuenta? Inicia sesión"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
        />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
