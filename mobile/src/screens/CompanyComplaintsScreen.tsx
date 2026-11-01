import { useState } from 'react';
import { FlatList, Modal, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_OPTIONS,
  categoryLabel,
  STATUS_OPTIONS,
  statusLabel,
  updateComplaintStatus,
  type Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from '../api/complaintsApi';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageTitle } from '../components/PageTitle';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { useCompanyComplaints } from '../hooks/useCompanyComplaints';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const CATEGORY_FILTER_OPTIONS = [{ value: '' as const, label: 'Todas las categorías' }, ...CATEGORY_OPTIONS];
const STATUS_FILTER_OPTIONS = [{ value: '' as const, label: 'Todos los estados' }, ...STATUS_OPTIONS];

const RESPONSE_STATUS_OPTIONS: Readonly<Record<ComplaintStatus, readonly ComplaintStatus[]>> = {
  PENDING: ['IN_REVIEW', 'RESOLVED', 'REJECTED'],
  IN_REVIEW: ['IN_REVIEW', 'PENDING', 'RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

/** Bandeja de reclamos recibidos por la empresa, con respuesta y transiciones válidas. */
export function CompanyComplaintsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const { complaints, loading, refreshing, error, refresh, replaceComplaint } = useCompanyComplaints(user?.companyId, { category, status });
  const [responding, setResponding] = useState<Complaint | null>(null);
  const [response, setResponse] = useState('');
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>('PENDING');
  const [responseError, setResponseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const openResponse = (complaint: Complaint) => {
    setResponding(complaint);
    setResponse(complaint.adminResponse ?? '');
    setNextStatus(RESPONSE_STATUS_OPTIONS[complaint.status][0] ?? complaint.status);
    setResponseError(null);
    setConfirmClose(false);
  };
  const closeResponse = () => {
    if (saving) return;
    setResponding(null);
    setConfirmClose(false);
  };
  const saveResponse = async () => {
    if (!responding) return;
    if (!response.trim()) {
      setResponseError('Escribe una respuesta para el pasajero.');
      return;
    }
    setSaving(true);
    setResponseError(null);
    try {
      const updated = await updateComplaintStatus(responding.id, { status: nextStatus, adminResponse: response });
      // Con un filtro de estado, si el reclamo ya no le corresponde se vuelve a pedir la lista.
      if (status && updated.status !== status) void refresh();
      else replaceComplaint(updated);
      setResponding(null);
      setConfirmClose(false);
    } catch (cause) {
      // Se vuelve al formulario, donde se ve el error y la respuesta escrita.
      setConfirmClose(false);
      setResponseError(cause instanceof Error ? cause.message : 'No se pudo actualizar el reclamo. Inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  };
  const requestSave = () => {
    if (!response.trim()) {
      setResponseError('Escribe una respuesta para el pasajero.');
      return;
    }
    if ((nextStatus === 'RESOLVED' || nextStatus === 'REJECTED') && responding?.status !== nextStatus) {
      setConfirmClose(true);
      return;
    }
    void saveResponse();
  };

  const header = (
    <View>
      <PageTitle title="Reclamos" subtitle="Revisa los reclamos recibidos de tus pasajeros" />
      {error ? <View style={styles.message} accessibilityRole="alert"><Text style={styles.messageText}>{error}</Text></View> : null}
      <View style={styles.filters}>
        <View style={styles.filter}><SelectField label="Categorías:" value={category} options={CATEGORY_FILTER_OPTIONS} onChange={setCategory} /></View>
        <View style={styles.filter}><SelectField label="Estados:" value={status} options={STATUS_FILTER_OPTIONS} onChange={setStatus} /></View>
      </View>
    </View>
  );

  const empty = loading ? <Text style={styles.loading}>Cargando reclamos...</Text> : error ? undefined : (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No hay reclamos</Text>
      <Text style={styles.emptyText}>Los reclamos de tus pasajeros aparecerán aquí</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={loading ? [] : complaints}
        keyExtractor={(complaint) => complaint.id}
        renderItem={({ item }) => <CompanyComplaintCard complaint={item} onRespond={() => openResponse(item)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.primary]} />}
      />
      {/* Un solo Modal: en iOS no se puede abrir otro Modal encima, así que la confirmación reemplaza al formulario. */}
      <Modal
        visible={responding !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (saving) return;
          if (confirmClose) setConfirmClose(false);
          else closeResponse();
        }}
      >
        <View style={styles.modalBackdrop}>
          {/* Mientras la ventana se desvanece ya no hay reclamo elegido: no se dibuja el contenido. */}
          {!responding ? null : confirmClose ? (
            <View style={styles.modalSheet} accessibilityViewIsModal>
              <Text style={styles.modalTitle} accessibilityRole="header">Confirmar cierre</Text>
              <Text style={styles.modalText}>¿Marcar este reclamo como {statusLabel(nextStatus).toLowerCase()}?</Text>
              <Text style={styles.modalWarning}>Después de cerrarlo, no se podrá volver a editar desde la aplicación.</Text>
              <View style={styles.modalActions}>
                <View style={styles.modalAction}><Button title="Volver" variant="secondary" onPress={() => setConfirmClose(false)} disabled={saving} /></View>
                <View style={styles.modalAction}><Button title="Confirmar" variant="danger" loadingTitle="Guardando..." loading={saving} onPress={() => void saveResponse()} /></View>
              </View>
            </View>
          ) : (
            <View style={styles.modalSheet} accessibilityViewIsModal>
              <Text style={styles.modalTitle} accessibilityRole="header">Responder reclamo</Text>
              <Text style={styles.modalSubject}>{responding?.title}</Text>
              <SelectField
                label="Nuevo estado"
                value={nextStatus}
                options={(responding ? RESPONSE_STATUS_OPTIONS[responding.status] : []).map((value) => ({ value, label: statusLabel(value) }))}
                onChange={setNextStatus}
              />
              <TextField
                label="Respuesta para el pasajero"
                value={response}
                onChangeText={(value) => { setResponse(value); setResponseError(null); }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!saving}
                error={responseError ?? undefined}
                placeholder="Escribe la respuesta que verá el pasajero"
              />
              <View style={styles.modalActions}>
                <View style={styles.modalAction}><Button title="Cancelar" variant="secondary" onPress={closeResponse} disabled={saving} /></View>
                <View style={styles.modalAction}><Button title="Guardar respuesta" loadingTitle="Guardando..." loading={saving} onPress={requestSave} /></View>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CompanyComplaintCard({ complaint, onRespond }: { complaint: Complaint; onRespond: () => void }) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={`company-complaint-${complaint.id}`}>
      <Text style={styles.cardTitle} accessibilityRole="header">{complaint.title}</Text>
      <Text style={styles.description}>{complaint.description}</Text>
      <Text style={styles.detail}><Text style={styles.detailLabel}>Categoría:</Text> {categoryLabel(complaint.category)}</Text>
      <Text style={styles.detail}><Text style={styles.detailLabel}>Estado:</Text> {statusLabel(complaint.status)}</Text>
      {complaint.adminResponse ? <Text style={styles.detail}><Text style={styles.detailLabel}>Respuesta:</Text> {complaint.adminResponse}</Text> : null}
      {RESPONSE_STATUS_OPTIONS[complaint.status].length > 0 ? (
        <View style={styles.cardAction}><Button title={complaint.status === 'IN_REVIEW' ? 'Editar respuesta' : 'Responder'} onPress={onRespond} /></View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  message: { marginBottom: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  messageText: { fontSize: font(16), color: colors.danger },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, marginBottom: spacing.lg, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  filter: { flexGrow: 1, flexBasis: 220 },
  loading: { textAlign: 'center', fontSize: font(16), color: colors.muted, paddingVertical: spacing.xl },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { fontSize: font(20), fontWeight: '600', color: colors.text },
  emptyText: { marginTop: spacing.xs, fontSize: font(16), color: colors.muted },
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: font(18), fontWeight: '600', color: colors.text },
  description: { marginTop: spacing.sm, fontSize: font(16), lineHeight: font(24), color: colors.muted },
  detail: { marginTop: spacing.sm, fontSize: font(16), lineHeight: font(24), color: colors.text },
  detailLabel: { fontWeight: '700' },
  cardAction: { marginTop: spacing.md, alignSelf: 'flex-start' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  modalSheet: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  modalTitle: { color: colors.text, fontSize: font(18), fontWeight: '800' },
  modalSubject: { marginTop: spacing.xs, marginBottom: spacing.md, color: colors.muted, fontSize: font(14) },
  modalText: { marginTop: spacing.sm, color: colors.text, fontSize: font(15), lineHeight: font(22) },
  modalWarning: { marginTop: spacing.sm, color: colors.muted, fontSize: font(13), lineHeight: font(19) },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalAction: { flex: 1 },
}));
