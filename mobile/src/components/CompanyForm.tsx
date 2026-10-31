import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { createCompany, setCompanyActive, updateCompany, type CompanySummary } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { COMPANY_FIELDS, formFromCompany, NEW_COMPANY_FORM, toCompanyInput, validateCompanyForm, type CompanyFormValues } from '../admin/companyForm';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SettingSwitchRow } from './SettingSwitchRow';
import { TextField } from './TextField';

export interface CompanyFormProps {
  visible: boolean;
  /** null = nueva empresa; si no, editar esa. */
  company: CompanySummary | null;
  onClose: () => void;
  /** Guardada, con el aviso a mostrar. */
  onSaved: (message: string) => void;
}

/**
 * "➕ Nueva Empresa" / "✏️ Editar Empresa", el modal de AdminCompaniesPage del
 * web: nombre, RUT, correo, teléfono, dirección y "Empresa activa". En el web
 * solo cambia la pantalla; aquí se guarda en backend-go.
 */
export function CompanyForm({ visible, company, onClose, onSaved }: CompanyFormProps) {
  const styles = useStyles();
  const [values, setValues] = useState<CompanyFormValues>(NEW_COMPANY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValues(company ? formFromCompany(company) : NEW_COMPANY_FORM);
    setError(null);
  }, [visible, company]);

  const set = (key: keyof CompanyFormValues) => (value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const invalid = validateCompanyForm(values);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toCompanyInput(values);
      const saved = company ? await updateCompany(company.id, input) : await createCompany(input);
      // El estado se guarda aparte (PATCH /companies/:id/status); una nueva queda activa.
      if (saved.isActive !== values.isActive) await setCompanyActive(saved.id, values.isActive);
      onSaved(company ? `Empresa ${input.name} actualizada` : `Empresa ${input.name} registrada`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la empresa. Inténtalo nuevamente.');
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
              {company ? '✏️ Editar Empresa' : '➕ Nueva Empresa'}
            </Text>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {COMPANY_FIELDS.map(({ key, label, placeholder }) => (
              <TextField
                key={key}
                label={label}
                value={values[key]}
                onChangeText={set(key)}
                placeholder={placeholder}
                editable={!saving}
                autoCapitalize={key === 'email' ? 'none' : key === 'rut' ? 'characters' : 'sentences'}
                autoCorrect={key === 'name' || key === 'address'}
                keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
              />
            ))}
            <SettingSwitchRow label="Empresa activa" value={values.isActive} onValueChange={set('isActive')} disabled={saving} />
            <View style={styles.actions}>
              <View style={styles.cancel}>
                <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={saving} />
              </View>
              <View style={styles.submit}>
                <Button title={company ? 'Guardar cambios' : 'Crear empresa'} loadingTitle="Guardando..." loading={saving} onPress={save} />
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
    maxWidth: 480,
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  // Como el web: "Cancelar" ocupa 1 parte y guardar 2.
  cancel: { flex: 1 },
  submit: { flex: 2 },
}));
