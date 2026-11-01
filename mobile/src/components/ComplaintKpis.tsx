import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { ComplaintStats } from '../api/adminApi';
import { filledStars, formatPercent, formatRating } from '../admin/complaintStats';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const AMBER = '#f59e0b';
const GREEN = '#4ade80';
const YELLOW = '#facc15';

/**
 * Las cuatro tarjetas de cifras de AdminComplaintsView del web: total, CSAT
 * promedio, tasa de resolución y pendientes. Muestran "—" hasta que hay datos.
 */
export function ComplaintKpis({ stats }: { stats: ComplaintStats | null }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const show = (value: (s: ComplaintStats) => string) => (stats ? value(stats) : '—');

  return (
    <View style={styles.kpis}>
      <View style={styles.kpi} accessible accessibilityLabel={`Total Reclamos: ${show((s) => String(s.total))}`}>
        <View style={styles.kpiHeader}>
          <Text style={[styles.kpiLabel, { color: colors.muted }]}>Total Reclamos</Text>
          <Text style={styles.kpiEmoji}>📋</Text>
        </View>
        <Text style={styles.kpiValue}>{show((s) => String(s.total))}</Text>
        <Text style={styles.kpiDetail}>Líneas 7A, 7B y 1C registradas</Text>
      </View>

      <View style={styles.kpi} accessible accessibilityLabel={`CSAT Promedio Flota: ${show((s) => formatRating(s.averageRating))} de 5`}>
        <View style={styles.kpiHeader}>
          <Text style={[styles.kpiLabel, { color: AMBER }]}>CSAT Promedio Flota</Text>
          <Ionicons name="star" size={18} color={AMBER} />
        </View>
        <View style={styles.ratingRow}>
          <Text style={[styles.kpiValue, { color: AMBER }]}>{show((s) => formatRating(s.averageRating))}</Text>
          <Text style={styles.ratingMax}>/ 5.0</Text>
        </View>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons key={n} name="star" size={13} color={stats && n <= filledStars(stats.averageRating) ? AMBER : 'rgba(245, 158, 11, 0.2)'} />
          ))}
        </View>
      </View>

      <View style={styles.kpi} accessible accessibilityLabel={`Tasa de Resolución: ${show((s) => formatPercent(s.resolvedPercentage))}`}>
        <View style={styles.kpiHeader}>
          <Text style={[styles.kpiLabel, { color: GREEN }]}>Tasa de Resolución</Text>
          <Ionicons name="trending-up" size={18} color={GREEN} />
        </View>
        <Text style={[styles.kpiValue, { color: GREEN }]}>{show((s) => formatPercent(s.resolvedPercentage))}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.min(100, stats?.resolvedPercentage ?? 0)}%`, backgroundColor: GREEN }]} />
        </View>
      </View>

      <View style={styles.kpi} accessible accessibilityLabel={`Reclamos Pendientes: ${show((s) => String(s.pending))}`}>
        <View style={styles.kpiHeader}>
          <Text style={[styles.kpiLabel, { color: YELLOW }]}>Reclamos Pendientes</Text>
          <Ionicons name="time" size={18} color={YELLOW} />
        </View>
        <Text style={[styles.kpiValue, { color: YELLOW }]}>{show((s) => String(s.pending))}</Text>
        <Text style={styles.kpiDetail}>Requieren revisión administrativa</Text>
      </View>
    </View>
  );
}

// Medidas de AdminComplaintsView del web (tarjetas --radius-xl, etiquetas 12 px en mayúsculas).
const useStyles = makeStyles((colors, font) => ({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  kpi: { flexGrow: 1, flexBasis: 150, padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kpiLabel: { flexShrink: 1, fontSize: font(12), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  kpiEmoji: { fontSize: 20 },
  kpiValue: { marginTop: 10, marginBottom: spacing.xs, color: colors.text, fontSize: font(32), fontWeight: '800' },
  kpiDetail: { color: colors.placeholder, fontSize: font(12), lineHeight: font(17) },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  ratingMax: { color: colors.muted, fontSize: font(14), fontWeight: '600' },
  stars: { flexDirection: 'row', gap: 4 },
  bar: { height: 6, marginTop: spacing.xs, borderRadius: radius.full, backgroundColor: colors.field, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.full },
}));
