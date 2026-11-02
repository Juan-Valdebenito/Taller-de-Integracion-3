import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { createUser, updateUser, type AdminUser, type CompanySummary } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { MIN_PASSWORD_LENGTH } from '../auth/validation';
import { formFromUser, losesCompany, newUserForm, ROLE_OPTIONS, toNewUserInput, toUserPatch, validateUserForm, type UserFormValues } from '../admin/userForm';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { SettingSwitchRow } from './SettingSwitchRow';
import { TextField } from './TextField';

export interface UserFormProps {
  /** Cuenta que se edita, 'new' para crear una, o null = cerrado. */
  user: AdminUser | 'new' | null;
  /** Todas las cuentas (para no repetir el correo). */
  users: readonly AdminUser[];
  companies: readonly CompanySummary[];
  /** Id del administrador con la sesión abierta. */
  myId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * "➕ Nuevo Usuario" / "✏️ Editar Usuario", el modal de AdminUsersPage del
 * web. Al crear se pide la contraseña inicial. En tu propia cuenta no se puede
 * cambiar el rol ni desactivarla.
 */
export function UserForm({ user: target, users, companies, myId, onClose, onSaved }: UserFormProps) {
  const styles = useStyles();
  const visible = target !== null;
  const user = target === 'new' ? null : target;
  const creating = target === 'new';
  const isSelf = !!user && user.id === myId;
  const [values, setValues] = useState<UserFormValues>(newUserForm());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const companyOptions = companies
    .filter((company) => company.isActive || company.id === user?.companyId)
    .map((company) => ({ value: company.id, label: company.name }));

  useEffect(() => {
    if (!target) return;
    setValues(target === 'new' ? newUserForm() : formFromUser(target));
    setPassword('');
    setError(null);
  }, [target]);

  const set = <K extends keyof UserFormValues>(key: K) => (value: UserFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const changeRole = (role: UserFormValues['role']) =>
    setValues((current) => ({ ...current, role, companyId: role === 'COMPANY' ? current.companyId || companyOptions[0]?.value || '' : current.companyId }));

  const create = async () => {
    const invalid = validateUserForm(values, { users, editingId: null, isSelf: false }, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createUser(toNewUserInput(values, password));
      // El registro siempre crea la cuenta activa; si se pidió inactiva, se aplica enseguida.
      if (!values.isActive) await updateUser(created.id, { isActive: false });
      onSaved(`Usuario ${created.name} creado`);
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (creating) return create();
    if (!user) return;
    const invalid = validateUserForm(values, { users, editingId: user.id, isSelf });
    if (invalid) {
      setError(invalid);
      return;
    }
    const patch = toUserPatch(values, user);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, patch);
      onSaved(`Usuario ${values.name.trim()} actualizado`);
    } catch (e) {
      // Los 500 de backend-go traen el error de la base de datos: no se muestran.
      setError(e instanceof ApiError && e.status < 500 ? e.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              {creating ? '➕ Nuevo Usuario' : '✏️ Editar Usuario'}
            </Text>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <TextField label="Nombre completo" value={values.name} onChangeText={set('name')} placeholder="Juan Pérez" editable={!saving} />
            <TextField
              label="Correo electrónico"
              value={values.email}
              onChangeText={set('email')}
              placeholder="juan@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            {creating ? (
              <>
                <TextField
                  label="Contraseña inicial"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!saving}
                />
                <Text style={[styles.hint, styles.passwordHint]}>Entrégasela a la persona por un medio seguro; con ella inicia sesión.</Text>
              </>
            ) : null}
            {isSelf ? (
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyLabel}>Rol</Text>
                <Text style={styles.readOnlyValue}>Admin</Text>
                <Text style={styles.hint}>Es tu cuenta: no puedes quitarte el rol ni desactivarla.</Text>
              </View>
            ) : (
              <SelectField label="Rol" value={values.role} options={ROLE_OPTIONS} onChange={changeRole} />
            )}
            {values.role === 'COMPANY' ? (
              companyOptions.length === 0 ? (
                <Text style={styles.hint}>No hay empresas activas: registra una en la pestaña Empresas.</Text>
              ) : (
                <SelectField label="Empresa" value={values.companyId} options={companyOptions} onChange={set('companyId')} />
              )
            ) : losesCompany(values, user) ? (
              <Text style={styles.hint}>Al dejar de ser Empresa, la cuenta deja de estar vinculada a su empresa.</Text>
            ) : null}
            {isSelf ? null : <SettingSwitchRow label="Usuario activo" value={values.isActive} onValueChange={set('isActive')} disabled={saving} />}
            <View style={styles.actions}>
              <View style={styles.cancel}>
                <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={saving} />
              </View>
              <View style={styles.submit}>
                <Button title={creating ? 'Crear usuario' : 'Guardar cambios'} loadingTitle="Guardando..." loading={saving} onPress={save} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors, font) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  content: { padding: spacing.lg },
  title: { marginBottom: spacing.lg, color: colors.text, fontSize: font(20), fontWeight: '800' },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  readOnly: { marginBottom: 14 },
  readOnlyLabel: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  readOnlyValue: { color: colors.muted, fontSize: font(14) },
  hint: { marginTop: spacing.xs, marginBottom: 14, color: colors.placeholder, fontSize: font(12), lineHeight: font(17) },
  passwordHint: { marginTop: -8 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancel: { flex: 1 },
  submit: { flex: 2 },
}));
