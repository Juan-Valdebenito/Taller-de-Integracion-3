import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { updateUser, type AdminUser, type CompanySummary } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { formFromUser, keepsOldCompany, ROLE_OPTIONS, toUserPatch, validateUserForm, type UserFormValues } from '../admin/userForm';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { SettingSwitchRow } from './SettingSwitchRow';
import { TextField } from './TextField';

export interface UserFormProps {
  /** Cuenta que se edita; null = cerrado. */
  user: AdminUser | null;
  /** Todas las cuentas (para no repetir el correo). */
  users: readonly AdminUser[];
  companies: readonly CompanySummary[];
  /** Id del administrador con la sesión abierta. */
  myId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const EMPTY: UserFormValues = { name: '', email: '', role: 'PASSENGER', companyId: '', isActive: true };

/**
 * "✏️ Editar Usuario", el modal de AdminUsersPage del web. En tu propia
 * cuenta no se puede cambiar el rol ni desactivarla.
 */
export function UserForm({ user, users, companies, myId, onClose, onSaved }: UserFormProps) {
  const styles = useStyles();
  const visible = user !== null;
  const isSelf = !!user && user.id === myId;
  const [values, setValues] = useState<UserFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const companyOptions = companies
    .filter((company) => company.isActive || company.id === user?.companyId)
    .map((company) => ({ value: company.id, label: company.name }));

  useEffect(() => {
    if (!user) return;
    setValues(formFromUser(user));
    setError(null);
  }, [user]);

  const set = <K extends keyof UserFormValues>(key: K) => (value: UserFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const changeRole = (role: UserFormValues['role']) =>
    setValues((current) => ({ ...current, role, companyId: role === 'COMPANY' ? current.companyId || companyOptions[0]?.value || '' : current.companyId }));

  const save = async () => {
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
              ✏️ Editar Usuario
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
            ) : keepsOldCompany(values, user) ? (
              <Text style={styles.hint}>La cuenta seguirá vinculada a su empresa anterior: el backend no permite quitarla.</Text>
            ) : null}
            {isSelf ? null : <SettingSwitchRow label="Usuario activo" value={values.isActive} onValueChange={set('isActive')} disabled={saving} />}
            <View style={styles.actions}>
              <View style={styles.cancel}>
                <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={saving} />
              </View>
              <View style={styles.submit}>
                <Button title="Guardar cambios" loadingTitle="Guardando..." loading={saving} onPress={save} />
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancel: { flex: 1 },
  submit: { flex: 2 },
}));
