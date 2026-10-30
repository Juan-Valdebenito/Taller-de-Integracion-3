import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CATEGORY_OPTIONS,
  categoryLabel,
  STATUS_OPTIONS,
  statusLabel,
  type Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from '../api/complaintsApi';
import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import { SelectField } from '../components/SelectField';
import { useMyComplaints } from '../hooks/useMyComplaints';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const CATEGORY_FILTER_OPTIONS = [{ value: '' as const, label: 'Todas las categorías' }, ...CATEGORY_OPTIONS];
const STATUS_FILTER_OPTIONS = [{ value: '' as const, label: 'Todos los estados' }, ...STATUS_OPTIONS];

/**
 * Pestaña Reclamos del pasajero, como PassengerComplaintsPage del web:
 * "📋 Mis Reclamos" con filtros por categoría y estado y una tarjeta por
 * reclamo (categoría, estado y respuesta del administrador si la hay).
 * Mientras carga, los filtros siguen a la vista; se recarga deslizando hacia abajo.
 */
export function ComplaintsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const { complaints, loading, refreshing, error, refresh } = useMyComplaints({ category, status });

  const header = (
    <View>
      <PageTitle emoji="📋" title="Mis Reclamos" subtitle="Consulta y registra tus reclamos" />
      {error ? (
        <View style={styles.message} accessibilityRole="alert">
          <Text style={styles.messageText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.filters}>
        <View style={styles.filter}>
          <SelectField label="Categorías:" value={category} options={CATEGORY_FILTER_OPTIONS} onChange={setCategory} />
        </View>
        <View style={styles.filter}>
          <SelectField label="Estados:" value={status} options={STATUS_FILTER_OPTIONS} onChange={setStatus} />
        </View>
      </View>
    </View>
  );

  const empty = loading ? (
    <Text style={styles.loading}>Cargando reclamos...</Text>
  ) : error ? undefined : (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>📭</Text>
      <Text style={styles.emptyTitle}>No tienes reclamos</Text>
      <Text style={styles.emptyText}>Tus reclamos aparecerán aquí</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={loading ? [] : complaints}
        keyExtractor={(complaint) => complaint.id}
        renderItem={({ item }) => <ComplaintCard complaint={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.primary]} />}
      />
    </SafeAreaView>
  );
}

function ComplaintCard({ complaint }: { complaint: Complaint }) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={`complaint-${complaint.id}`}>
      <Text style={styles.cardTitle} accessibilityRole="header">{complaint.title}</Text>
      <Text style={styles.description}>{complaint.description}</Text>
      <Text style={styles.detail}>
        <Text style={styles.detailLabel}>Categoría:</Text> {categoryLabel(complaint.category)}
      </Text>
      <Text style={styles.detail}>
        <Text style={styles.detailLabel}>Estado:</Text> {statusLabel(complaint.status)}
      </Text>
      {complaint.adminResponse ? (
        <Text style={styles.detail}>
          <Text style={styles.detailLabel}>Respuesta del administrador:</Text> {complaint.adminResponse}
        </Text>
      ) : null}
    </Card>
  );
}

// Espaciados del web: página --space-8 en escritorio (aquí --space-6), tarjetas --space-6 con --radius-lg.
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  message: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  messageText: { fontSize: font(16), color: colors.text },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    marginBottom: spacing.lg,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20 - 14, // SelectField ya deja 14 px debajo
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  filter: { flexGrow: 1, flexBasis: 220 },
  loading: { textAlign: 'center', fontSize: font(16), color: colors.muted, paddingVertical: spacing.xl },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 48, lineHeight: 58 },
  emptyTitle: { marginTop: spacing.md, fontSize: font(20), fontWeight: '600', color: colors.text },
  emptyText: { marginTop: spacing.xs, fontSize: font(16), color: colors.muted },
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: font(18), fontWeight: '600', color: colors.text },
  description: { marginTop: spacing.sm, fontSize: font(16), lineHeight: font(24), color: colors.muted },
  detail: { marginTop: spacing.sm, fontSize: font(16), lineHeight: font(24), color: colors.text },
  detailLabel: { fontWeight: '700' },
}));
