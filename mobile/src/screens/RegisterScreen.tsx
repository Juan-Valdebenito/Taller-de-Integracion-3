import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { hasErrors, validateRegister, type FieldErrors, type RegisterFormInput } from '../auth/validation';
import { AuthFooterLink } from '../components/AuthFooterLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useCooldown } from '../hooks/useCooldown';
import { spacing } from '../theme';

const EMPTY_FORM: RegisterFormInput = { name: '', email: '', password: '' };

export function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const cooldown = useCooldown();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

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
      await signUp(form);
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
      subtitle="Tus datos son sanitizados y tu contraseña es hasheada con bcrypt"
      message={message}
      messageTone={cooldown.active ? 'warning' : 'error'}
    >
      <TextField
        label="Nombre Completo"
        value={form.name}
        onChangeText={update('name')}
        error={fieldErrors.name}
        placeholder="Juan Valdebenito"
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
        placeholder="juan@ejemplo.cl"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Contraseña (Mín. 8 caracteres, letras y números)"
        value={form.password}
        onChangeText={update('password')}
        error={fieldErrors.password}
        placeholder="Al menos 8 caracteres..."
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <View style={styles.actions}>
        <Button
          title={cooldown.active ? `Espera ${cooldown.secondsLeft} s` : 'Crear Cuenta Segura'}
          loadingTitle="Registrando y Protegiendo Datos..."
          onPress={submit}
          loading={submitting}
          disabled={cooldown.active}
        />
      </View>
      <AuthFooterLink
        prompt="¿Ya tienes cuenta?"
        link="Inicia sesión"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
