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
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import { SelectField } from '../components/SelectField';
import { useCompanyComplaints } from '../hooks/useCompanyComplaints';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { useState } from 'react';

const CATEGORY_FILTER_OPTIONS = [{ value: '' as const, label: 'Todas las categorías' }, ...CATEGORY_OPTIONS];
const STATUS_FILTER_OPTIONS = [{ value: '' as const, label: 'Todos los estados' }, ...STATUS_OPTIONS];

/** Bandeja de reclamos recibidos por la empresa. La respuesta se incorpora en 2d2. */
export function CompanyComplaintsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const { complaints, loading, refreshing, error, refresh } = useCompanyComplaints(user?.companyId, { category, status });

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
        renderItem={({ item }) => <CompanyComplaintCard complaint={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.primary]} />}
      />
    </SafeAreaView>
  );
}

function CompanyComplaintCard({ complaint }: { complaint: Complaint }) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={`company-complaint-${complaint.id}`}>
      <Text style={styles.cardTitle} accessibilityRole="header">{complaint.title}</Text>
      <Text style={styles.description}>{complaint.description}</Text>
      <Text style={styles.detail}><Text style={styles.detailLabel}>Categoría:</Text> {categoryLabel(complaint.category)}</Text>
      <Text style={styles.detail}><Text style={styles.detailLabel}>Estado:</Text> {statusLabel(complaint.status)}</Text>
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
}));
