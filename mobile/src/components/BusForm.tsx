import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { createCompanyBus, saveCompanyBus, updateCompanyBus, type CompanyBus, type CompanyRoute } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { BUS_STATUS_OPTIONS, formatPlate, formFromBus, NEW_BUS_FORM, validateBusForm, type BusFormValues } from '../company/busForm';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';
import { SelectField } from './SelectField';
import { TextField } from './TextField';

export interface BusFormProps {
  visible: boolean;
  /** null = registrar una nueva; si no, editar esa micro. */
  bus: CompanyBus | null;
  routes: readonly CompanyRoute[];
  companyId: string | null;
  onClose: () => void;
  /** Guardada: el mensaje es el aviso del web ("Micro X incorporada a la flota"). */
  onSaved: (message: string) => void;
}

/**
 * "➕ Registrar Nueva Micro" / "✏️ Editar Micro X", el modal del web:
 * patente, capacidad, ruta y estado. Al crear, backend-go deja la micro
 * INACTIVE; si se eligió otro estado se aplica enseguida (el web lo ignora).
 */
export function BusForm({ visible, bus, routes, companyId, onClose, onSaved }: BusFormProps) {
  const styles = useStyles();
  const [values, setValues] = useState<BusFormValues>(NEW_BUS_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValues(bus ? formFromBus(bus) : NEW_BUS_FORM);
    setError(null);
  }, [visible, bus]);

  const set = <K extends keyof BusFormValues>(key: K) => (value: BusFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const invalid = validateBusForm(values);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!bus && !companyId) {
      setError('La cuenta no está asociada a una empresa. Contacta a un administrador.');
      return;
    }
    setSaving(true);
    setError(null);
    const patente = formatPlate(values.patente);
    const input = { patente, capacity: Number(values.capacity), routeId: values.routeId || null };
    try {
      if (bus) {
        await saveCompanyBus(bus.id, { ...input, status: values.status });
        onSaved(`Micro ${patente} actualizada exitosamente`);
      } else {
        const created = await createCompanyBus({ ...input, companyId: companyId! });
        if (values.status !== created.status) await updateCompanyBus(created.id, { status: values.status });
        onSaved(`Micro ${patente} incorporada a la flota`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al guardar la micro');
    } finally {
      setSaving(false);
    }
  };

  const routeOptions = [
    { value: '', label: 'Sin Asignar (Reserva en Terminal)' },
    ...routes.map((route) => ({ value: route.id, label: `Línea ${route.code} – ${route.name}` })),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {
        if (!saving) onClose();
      }}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              {bus ? `✏️ Editar Micro ${bus.patente}` : '➕ Registrar Nueva Micro'}
            </Text>

            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TextField
              label="Patente (Placa Patente Única)"
              value={values.patente}
              onChangeText={(text) => set('patente')(text.toUpperCase())}
              placeholder="Ej: BGPK-45 o ABCD-12"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              editable={!saving}
            />
            <TextField
              label="Capacidad Máxima de Pasajeros"
              value={values.capacity}
              onChangeText={set('capacity')}
              keyboardType="number-pad"
              maxLength={3}
              editable={!saving}
            />
            <SelectField label="Línea / Ruta Asignada" value={values.routeId} options={routeOptions} onChange={set('routeId')} />
            <SelectField label="Estado Operacional" value={values.status} options={BUS_STATUS_OPTIONS} onChange={set('status')} />

            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button title="Cancelar" variant="secondary" onPress={onClose} disabled={saving} />
              </View>
              <View style={styles.flex}>
                <Button title={bus ? 'Guardar Cambios' : 'Registrar Micro'} loadingTitle="Guardando..." loading={saving} onPress={save} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors, font) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  content: { padding: spacing.lg },
  title: { marginBottom: spacing.md, color: colors.text, fontSize: font(18), fontWeight: '800' },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex: { flex: 1 },
}));
