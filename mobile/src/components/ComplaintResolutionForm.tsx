import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ApiError } from '../api/errors';
import { updateComplaintStatus, type ComplaintStatus } from '../api/complaintsApi';
import { closesComplaint, initialTarget, RESOLUTION_OPTIONS, validateResolution } from '../admin/complaintResolution';
import { adminStatus, type AdminComplaintRow } from '../admin/complaints';
import { adminCategory } from '../admin/complaintStats';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { Button } from './Button';
import { TextField } from './TextField';

const AMBER = '#f59e0b';

export interface ComplaintResolutionFormProps {
  /** Reclamo que se gestiona; null = cerrado. */
  complaint: AdminComplaintRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** "16 de octubre de 2026, 12:05" (hora local), como la "Fecha de Emisión" del web. */
function issuedAt(complaint: AdminComplaintRow): string {
  const date = new Date(complaint.createdAt);
  if (!complaint.date || Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${complaint.date}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "Resolución Oficial de Reclamo", el modal de AdminComplaintsView del web:
 * contexto del incidente, descripción del pasajero, nuevo estado y respuesta.
 * Resolver o rechazar se confirma dentro del mismo Modal (en iOS no se puede
 * abrir otro encima).
 */
export function ComplaintResolutionForm({ complaint, onClose, onSaved }: ComplaintResolutionFormProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [target, setTarget] = useState<ComplaintStatus>('IN_REVIEW');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!complaint) return;
    setTarget(initialTarget(complaint.status));
    setResponse(complaint.adminResponse ?? '');
    setError(null);
    setConfirming(false);
  }, [complaint]);

  const close = () => {
    if (saving) return;
    if (confirming) setConfirming(false);
    else onClose();
  };

  const save = async () => {
    if (!complaint) return;
    setSaving(true);
    setError(null);
    try {
      await updateComplaintStatus(complaint.id, { status: target, adminResponse: response });
      onSaved(`Reclamo ${complaint.shortId} actualizado a ${adminStatus(target).label.toLowerCase()}`);
    } catch (e) {
      // Se vuelve al formulario, donde se ve el error y la respuesta escrita.
      setConfirming(false);
      setError(e instanceof ApiError ? e.message : 'No se pudo actualizar el reclamo. Inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!complaint) return;
    const invalid = validateResolution(response);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (closesComplaint(complaint.status, target)) setConfirming(true);
    else void save();
  };

  const rating = complaint?.rating ?? 0;
  const category = complaint ? adminCategory(complaint.category) : null;

  return (
    <Modal visible={complaint !== null} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!complaint || !category ? null : confirming ? (
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.content}>
              <Text style={styles.title} accessibilityRole="header">
                {target === 'RESOLVED' ? 'Resolver reclamo' : 'Rechazar reclamo'}
              </Text>
              <Text style={styles.confirmText}>
                ¿Marcar el reclamo {complaint.shortId} como {adminStatus(target).label.toLowerCase()}? El pasajero verá tu respuesta y el reclamo quedará cerrado.
              </Text>
              <View style={styles.actions}>
                <View style={styles.cancel}>
                  <Button title="Volver" variant="secondary" onPress={() => setConfirming(false)} disabled={saving} />
                </View>
                <View style={styles.submit}>
                  <Button title="Confirmar" loadingTitle="Guardando..." loading={saving} onPress={() => void save()} />
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.sheet} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={styles.kicker}>Resolución Oficial de Reclamo</Text>
                  <Text style={styles.title} accessibilityRole="header">
                    {complaint.title || 'Detalle del Incidente'}
                  </Text>
                </View>
                <Pressable onPress={close} disabled={saving} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8}>
                  <Text style={styles.closeX}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.context}>
                <ContextRow label="Línea / Micro:" value={`${complaint.lineName ?? 'Sin línea'}${complaint.busPlate ? ` (${complaint.busPlate})` : ''}`} />
                <ContextRow label="Categoría:" value={category.label} />
                <View style={styles.contextRow} accessible accessibilityLabel={`Calificación Pasajero: ${rating} de 5`}>
                  <Text style={styles.contextLabel}>Calificación Pasajero:</Text>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name="star" size={12} color={n <= rating ? AMBER : '#475569'} />
                    ))}
                    <Text style={styles.ratingText}>({rating}/5)</Text>
                  </View>
                </View>
                <ContextRow label="Fecha de Emisión:" value={issuedAt(complaint)} />
                {complaint.companyName ? <ContextRow label="Empresa:" value={complaint.companyName} /> : null}
              </View>

              <Text style={styles.label}>Descripción reportada por el usuario:</Text>
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{complaint.description || 'Sin comentarios adicionales'}</Text>
              </View>

              {error ? (
                <View style={styles.error} accessibilityRole="alert">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Nuevo Estado del Incidente</Text>
              <View style={styles.statusRow} accessibilityRole="radiogroup">
                {RESOLUTION_OPTIONS.map((option) => {
                  const selected = target === option.value;
                  const cfg = adminStatus(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setTarget(option.value)}
                      disabled={saving}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: saving }}
                      accessibilityLabel={option.label}
                      style={[styles.statusOption, selected ? { backgroundColor: cfg.bg, borderColor: cfg.border } : { borderColor: colors.border }]}
                    >
                      <Text style={[styles.statusText, { color: selected ? cfg.color : colors.muted }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextField
                label="Respuesta Oficial de la Administración"
                value={response}
                onChangeText={setResponse}
                placeholder="Detalla las medidas tomadas (ej: inspección de aforo en taller, amonestación a operador, etc.)..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={styles.responseInput}
                editable={!saving}
              />

              <View style={styles.actions}>
                <View style={styles.cancel}>
                  <Button title="Cancelar" variant="secondary" onPress={close} disabled={saving} />
                </View>
                <View style={styles.submit}>
                  <Button title="Guardar Resolución" loadingTitle="Guardando..." loading={saving} onPress={requestSave} />
                </View>
              </View>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.contextRow} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={styles.contextValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  content: { padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  headerText: { flex: 1 },
  kicker: { color: colors.accent, fontSize: font(11), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { marginTop: 4, color: colors.text, fontSize: font(18), fontWeight: '800' },
  closeX: { color: colors.muted, fontSize: font(18) },
  context: { gap: spacing.sm, marginBottom: spacing.md, padding: 12, borderRadius: radius.md, backgroundColor: colors.field },
  contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  contextLabel: { color: colors.muted, fontSize: font(12) },
  contextValue: { flexShrink: 1, color: colors.text, fontSize: font(13), fontWeight: '700', textAlign: 'right' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { marginLeft: 4, color: colors.muted, fontSize: font(12) },
  label: { marginBottom: 6, color: colors.muted, fontSize: font(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  descriptionBox: { marginBottom: spacing.md, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  descriptionText: { color: colors.text, fontSize: font(13), lineHeight: font(19) },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statusOption: { flexGrow: 1, flexBasis: 100, alignItems: 'center', paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  statusText: { fontSize: font(12), fontWeight: '700' },
  responseInput: { minHeight: 96 },
  confirmText: { marginTop: spacing.sm, color: colors.muted, fontSize: font(14), lineHeight: font(21) },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancel: { flex: 1 },
  submit: { flex: 2 },
}));
