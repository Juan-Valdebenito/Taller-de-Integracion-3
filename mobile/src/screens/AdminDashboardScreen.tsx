import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ComplaintStats } from '../api/adminApi';
import { adminCategory, breakdown, filledStars, formatPercent, formatRating } from '../admin/complaintStats';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const AMBER = '#f59e0b';
const GREEN = '#4ade80';
const YELLOW = '#facc15';
const SKY = '#38bdf8';

/**
 * Dashboard del administrador: la parte de estadísticas del "Panel de
 * Reclamos y Calidad de Servicio" del web (AdminComplaintsView): total, CSAT
 * promedio, tasa de resolución y pendientes de toda la plataforma. Suma la
 * distribución por categoría y por línea, que el web pide al backend pero no
 * muestra. La lista y la gestión de reclamos están en la pestaña Reclamos.
 */
export function AdminDashboardScreen() {
  const { stats, loading, error, refresh } = useAdminDashboard();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const show = (value: (s: ComplaintStats) => string) => (stats ? value(stats) : '—');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
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

        {stats ? (
          <>
            <StatusSummary stats={stats} />
            <Breakdown title="Reclamos por categoría" rows={breakdown(stats.byCategory)} label={(key) => `${adminCategory(key).icon} ${adminCategory(key).label}`} />
            <Breakdown title="Reclamos por línea" rows={breakdown(stats.byLine)} label={(key) => `Línea ${key}`} />
          </>
        ) : null}

        <Pressable
          onPress={() => router.push('/admin/complaints' as Href)}
          accessibilityRole="button"
          accessibilityLabel="Gestionar reclamos"
          style={({ pressed }) => [styles.shortcut, pressed && styles.dimmed]}
        >
          <View style={styles.shortcutText}>
            <Text style={styles.shortcutTitle}>Gestionar reclamos</Text>
            <Text style={styles.shortcutDetail}>Revisa, filtra y responde los reclamos de toda la plataforma</Text>
          </View>
          <Text style={styles.link}>Ver reclamos ›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Cuántos reclamos hay en cada estado, con los colores de estado del web. */
function StatusSummary({ stats }: { stats: ComplaintStats }) {
  const styles = useStyles();
  const items = [
    { label: 'Pendientes', count: stats.pending, color: YELLOW },
    { label: 'En revisión', count: stats.inReview, color: SKY },
    { label: 'Resueltos', count: stats.resolved, color: GREEN },
    { label: 'Rechazados', count: stats.rejected, color: '#f87171' },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Reclamos por estado</Text>
      <View style={styles.statusRow}>
        {items.map(({ label, count, color }) => (
          <View key={label} style={styles.statusItem} accessible accessibilityLabel={`${label}: ${count}`}>
            <Text style={[styles.statusCount, { color }]}>{count}</Text>
            <Text style={styles.statusLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Breakdown({ title, rows, label }: { title: string; rows: ReturnType<typeof breakdown>; label: (key: string) => string }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.muted}>Sin reclamos registrados.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.key} style={styles.breakdownRow} accessible accessibilityLabel={`${label(row.key)}: ${row.count} (${row.percent}%)`}>
            <View style={styles.breakdownLabels}>
              <Text style={styles.breakdownLabel} numberOfLines={1}>{label(row.key)}</Text>
              <Text style={styles.breakdownCount}>
                {row.count} · {row.percent}%
              </Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${row.percent}%`, backgroundColor: SKY }]} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// Medidas de AdminComplaintsView del web (tarjetas --radius-xl, etiquetas 12 px en mayúsculas).
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
  section: { marginBottom: spacing.md, padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sectionTitle: { marginBottom: 12, color: colors.text, fontSize: font(15), fontWeight: '700' },
  muted: { color: colors.muted, fontSize: font(14) },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.field },
  statusCount: { fontSize: font(20), fontWeight: '800' },
  statusLabel: { marginTop: 2, color: colors.muted, fontSize: font(11), textAlign: 'center' },
  breakdownRow: { marginBottom: 12 },
  breakdownLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  breakdownLabel: { flex: 1, color: colors.text, fontSize: font(13) },
  breakdownCount: { color: colors.muted, fontSize: font(12), fontVariant: ['tabular-nums'] },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shortcutText: { flex: 1 },
  shortcutTitle: { color: colors.text, fontSize: font(16), fontWeight: '700' },
  shortcutDetail: { marginTop: 2, color: colors.muted, fontSize: font(13), lineHeight: font(18) },
  link: { color: colors.accent, fontSize: font(14), fontWeight: '700' },
}));
