import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  adminStatus,
  CATEGORY_FILTER_OPTIONS,
  EMPTY_COMPLAINT_FILTERS,
  filterComplaints,
  LINE_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  type AdminComplaintFilters,
  type AdminComplaintRow,
} from '../admin/complaints';
import { canManage } from '../admin/complaintResolution';
import { adminCategory } from '../admin/complaintStats';
import { ComplaintKpis } from '../components/ComplaintKpis';
import { ComplaintResolutionForm } from '../components/ComplaintResolutionForm';
import { SelectField } from '../components/SelectField';
import { useAdminComplaints } from '../hooks/useAdminComplaints';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const AMBER = '#f59e0b';

/**
 * Reclamos de toda la plataforma (administrador), como AdminComplaintsView
 * del web: las cifras del encabezado, filtros por línea, estado y categoría,
 * el buscador y una tarjeta por reclamo (la tabla del web no cabe en un
 * teléfono) con "Gestionar" para cambiar su estado y responder. Los
 * reclamos resueltos o rechazados quedan cerrados.
 */
export function AdminComplaintsScreen() {
  const { complaints, stats, loading, error, refresh } = useAdminComplaints();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filters, setFilters] = useState<AdminComplaintFilters>(EMPTY_COMPLAINT_FILTERS);
  const visible = useMemo(() => filterComplaints(complaints, filters), [complaints, filters]);
  const [managing, setManaging] = useState<AdminComplaintRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Se recarga todo: cambian el reclamo, las cifras y quizá ya no calce con los filtros.
  const onSaved = (message: string) => {
    setManaging(null);
    setToast(message);
    void refresh();
  };

  const set = (key: keyof AdminComplaintFilters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        {toast ? (
          <LinearGradient colors={['#1f9d4f', '#167a3c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toast}>
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={styles.toastText} accessibilityRole="alert">
              {toast}
            </Text>
          </LinearGradient>
        ) : null}

        <Text style={styles.title} accessibilityRole="header">Panel de Reclamos y Calidad de Servicio</Text>
        <Text style={styles.subtitle}>Supervisión analítica y resolución de incidentes para las líneas 7A, 7B y 1C de Temuco.</Text>
        <Pressable
          onPress={() => void refresh()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Actualizar Datos"
          style={({ pressed }) => [styles.refresh, (pressed || loading) && styles.dimmed]}
        >
          <Ionicons name="sync" size={15} color={colors.text} />
          <Text style={styles.refreshText}>{loading ? 'Actualizando...' : 'Actualizar Datos'}</Text>
        </Pressable>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ComplaintKpis stats={stats} />

        <View style={styles.filters}>
          <View style={styles.filtersHeader}>
            <Ionicons name="filter" size={14} color={colors.muted} />
            <Text style={styles.filtersTitle}>Filtros</Text>
          </View>
          <SelectField label="Línea" value={filters.line} options={LINE_FILTER_OPTIONS} onChange={set('line')} />
          <SelectField label="Estado" value={filters.status} options={STATUS_FILTER_OPTIONS} onChange={set('status')} />
          <SelectField label="Categoría" value={filters.category} options={CATEGORY_FILTER_OPTIONS} onChange={set('category')} />
          <Text style={styles.searchLabel}>Búsqueda</Text>
          <View style={styles.search}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={filters.search}
              onChangeText={set('search')}
              placeholder="Buscar por ID, micro o descripción..."
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Buscar reclamo"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
        </View>

        <Text style={styles.listTitle} accessibilityRole="header">
          Listado de Reclamos ({visible.length})
        </Text>
        {loading && complaints.length === 0 ? (
          <Text style={styles.empty}>Cargando reclamos del sistema...</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{error ? '' : 'No se encontraron reclamos con los filtros seleccionados.'}</Text>
        ) : (
          visible.map((complaint) => <ComplaintCard key={complaint.id} complaint={complaint} onManage={() => setManaging(complaint)} />)
        )}
      </ScrollView>
      <ComplaintResolutionForm complaint={managing} onClose={() => setManaging(null)} onSaved={onSaved} />
    </SafeAreaView>
  );
}

function ComplaintCard({ complaint, onManage }: { complaint: AdminComplaintRow; onManage: () => void }) {
  const styles = useStyles();
  const status = adminStatus(complaint.status);
  const category = adminCategory(complaint.category);
  const rating = complaint.rating ?? 0;
  const line = complaint.lineName ? `Línea ${complaint.lineName}` : 'Sin línea';
  const label = [
    `Reclamo ${complaint.shortId}`,
    complaint.title,
    category.label,
    status.label.toLowerCase(),
    line,
    rating ? `${rating} de 5 estrellas` : 'sin calificación',
    complaint.companyName,
    complaint.busPlate ? `micro ${complaint.busPlate}` : null,
    complaint.date,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <View style={styles.info} accessible accessibilityLabel={label}>
        <View style={styles.cardTop}>
          <Text style={styles.shortId}>{complaint.shortId}</Text>
          <Text style={[styles.badge, { color: status.color, backgroundColor: status.bg, borderColor: status.border }]}>{status.label}</Text>
        </View>
        {complaint.title ? <Text style={styles.cardTitle}>{complaint.title}</Text> : null}
        <Text style={styles.category}>
          {category.icon} {category.label}
        </Text>
        <View style={styles.row}>
          <Text style={styles.line}>{line}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons key={n} name="star" size={12} color={n <= rating ? AMBER : 'rgba(255,255,255,0.15)'} />
            ))}
          </View>
        </View>
        {complaint.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {complaint.description}
          </Text>
        ) : null}
        <View style={styles.meta}>
          {complaint.companyName ? <Text style={styles.metaText}>🏢 {complaint.companyName}</Text> : null}
          {complaint.busPlate ? <Text style={styles.metaText}>🚍 {complaint.busPlate}</Text> : null}
          {complaint.date ? <Text style={styles.metaText}>📅 {complaint.date}</Text> : null}
        </View>
        {complaint.adminResponse ? (
          <View style={styles.response}>
            <Text style={styles.responseLabel}>Respuesta</Text>
            <Text style={styles.responseText}>{complaint.adminResponse}</Text>
          </View>
        ) : null}
      </View>
      {canManage(complaint.status) ? (
        <Pressable
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel={`Gestionar reclamo ${complaint.shortId}`}
          style={({ pressed }) => [styles.manage, pressed && styles.dimmed]}
        >
          <Ionicons name="create-outline" size={14} color="#5e9aed" />
          <Text style={styles.manageText}>Gestionar</Text>
        </Pressable>
      ) : (
        <Text style={styles.closed}>Reclamo cerrado</Text>
      )}
    </View>
  );
}

// Medidas de AdminComplaintsView del web.
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(24), lineHeight: font(30), fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: font(14), lineHeight: font(20) },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  refreshText: { color: colors.text, fontSize: font(13), fontWeight: '600' },
  dimmed: { opacity: 0.7 },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  filters: { marginBottom: spacing.lg, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filtersHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 12 },
  filtersTitle: { color: colors.muted, fontSize: font(12), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  searchLabel: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: font(14) },
  listTitle: { marginBottom: 12, color: colors.text, fontSize: font(16), fontWeight: '700' },
  empty: { paddingVertical: 48, textAlign: 'center', color: colors.placeholder, fontSize: font(14) },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  toastText: { flex: 1, color: '#ffffff', fontSize: font(14), fontWeight: '600' },
  info: { gap: spacing.sm },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(30, 111, 224, 0.4)',
    backgroundColor: 'rgba(30, 111, 224, 0.12)',
  },
  manageText: { color: '#5e9aed', fontSize: font(13), fontWeight: '700' },
  closed: { textAlign: 'center', color: colors.placeholder, fontSize: font(12) },
  card: { marginBottom: spacing.md, padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  shortId: { color: colors.muted, fontSize: font(12), fontFamily: 'monospace' },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1, fontSize: font(10), fontWeight: '800', letterSpacing: 0.5, overflow: 'hidden' },
  cardTitle: { color: colors.text, fontSize: font(15), fontWeight: '700' },
  category: { color: colors.text, fontSize: font(13) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  line: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(30, 111, 224, 0.15)',
    color: '#5e9aed',
    fontSize: font(12),
    fontWeight: '700',
    overflow: 'hidden',
  },
  stars: { flexDirection: 'row', gap: 2 },
  description: { color: colors.muted, fontSize: font(13), lineHeight: font(19) },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  metaText: { color: colors.placeholder, fontSize: font(12) },
  response: { padding: 10, borderRadius: radius.md, backgroundColor: colors.field },
  responseLabel: { marginBottom: 2, color: colors.muted, fontSize: font(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  responseText: { color: colors.text, fontSize: font(13), lineHeight: font(19) },
}));
