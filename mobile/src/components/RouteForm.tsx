import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { createRoute, updateRoute, type CompanySummary } from '../api/adminApi';
import type { CompanyRoute } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { formFromRoute, newRouteForm, toNewRouteInput, toRouteUpdateInput, validateRouteForm, type RouteFormValues } from '../admin/routeForm';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { SettingSwitchRow } from './SettingSwitchRow';
import { TextField } from './TextField';

export interface RouteFormProps {
  visible: boolean;
  /** null = nueva ruta; si no, editar esa. */
  route: CompanyRoute | null;
  /** Rutas existentes (para no repetir el código). */
  routes: readonly CompanyRoute[];
  companies: readonly CompanySummary[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * "➕ Nueva Ruta" / "✏️ Editar Ruta", el modal de AdminRoutesPage del web:
 * código, nombre, empresa (no se cambia al editar: el backend no lo permite),
 * descripción y "Ruta activa". Al crear, el web ignora "Ruta activa"; aquí se
 * aplica.
 */
export function RouteForm({ visible, route, routes, companies, onClose, onSaved }: RouteFormProps) {
  const styles = useStyles();
  const activeCompanies = companies.filter((company) => company.isActive || company.id === route?.companyId);
  const [values, setValues] = useState<RouteFormValues>(newRouteForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValues(route ? formFromRoute(route) : newRouteForm(activeCompanies[0]?.id ?? ''));
    setError(null);
    // Solo al abrir: las empresas no cambian mientras el formulario está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, route]);

  const set = (key: keyof RouteFormValues) => (value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const invalid = validateRouteForm(values, routes, route?.id ?? null);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (route) {
        await updateRoute(route.id, toRouteUpdateInput(values));
        onSaved(`Ruta ${values.code.trim()} actualizada`);
      } else {
        const created = await createRoute(toNewRouteInput(values));
        // El backend crea la ruta activa; si se pidió inactiva, se aplica enseguida.
        if (!values.isActive) await updateRoute(created.id, toRouteUpdateInput(values));
        onSaved(`Ruta ${values.code.trim()} creada`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  };

  const companyName = companies.find((company) => company.id === values.companyId)?.name ?? values.companyId;

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
              {route ? '✏️ Editar Ruta' : '➕ Nueva Ruta'}
            </Text>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <TextField label="Código" value={values.code} onChangeText={set('code')} placeholder="101" autoCapitalize="characters" autoCorrect={false} editable={!saving} />
            <TextField label="Nombre" value={values.name} onChangeText={set('name')} placeholder="Centro – Labranza" editable={!saving} />
            {route ? (
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyLabel}>Empresa</Text>
                <Text style={styles.readOnlyValue}>{companyName}</Text>
                <Text style={styles.hint}>La empresa no se modifica desde el endpoint actual del backend.</Text>
              </View>
            ) : activeCompanies.length === 0 ? (
              <Text style={styles.hint}>No hay empresas activas: registra una en la pestaña Empresas para crear rutas.</Text>
            ) : (
              <SelectField
                label="Empresa"
                value={values.companyId}
                options={activeCompanies.map((company) => ({ value: company.id, label: company.name }))}
                onChange={set('companyId')}
              />
            )}
            <TextField
              label="Descripción"
              value={values.description}
              onChangeText={set('description')}
              placeholder="Descripción del recorrido..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={styles.description}
              editable={!saving}
            />
            <SettingSwitchRow label="Ruta activa" value={values.isActive} onValueChange={set('isActive')} disabled={saving} />
            <View style={styles.actions}>
              <View style={styles.cancel}>
                <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={saving} />
              </View>
              <View style={styles.submit}>
                <Button
                  title={route ? 'Guardar cambios' : 'Crear ruta'}
                  loadingTitle="Guardando..."
                  loading={saving}
                  disabled={!route && activeCompanies.length === 0}
                  onPress={save}
                />
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
  readOnly: { marginBottom: 14 },
  readOnlyLabel: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  readOnlyValue: { color: colors.muted, fontSize: font(14) },
  hint: { marginTop: spacing.xs, marginBottom: 14, color: colors.placeholder, fontSize: font(12), lineHeight: font(17) },
  description: { minHeight: 80 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancel: { flex: 1 },
  submit: { flex: 2 },
}));
