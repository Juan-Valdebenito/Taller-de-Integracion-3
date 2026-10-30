import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import type { CompanyDashboardStats } from '../company/dashboardStats';
import { useCompanyDashboard } from '../hooks/useCompanyDashboard';
import { makeStyles, radius, spacing, useTheme } from '../theme';

export interface DashboardCard {
  icon: string;
  label: string;
  /** "—" mientras no hay dato, como el web. */
  value: string;
  /** Contexto bajo el número ("de 5 micros"). */
  detail: string | null;
}

/** "1 micro", "3 micros", "1 ruta activa", "2 rutas activas". */
export const countLabel = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

/** Las 4 tarjetas del dashboard del web, en su orden, con íconos y nombres iguales. */
export function dashboardCards(stats: CompanyDashboardStats, loading: boolean): DashboardCard[] {
  const show = (n: number | null) => (loading || n === null ? '—' : String(n));
  return [
    { icon: '🚍', label: 'Micros activas', value: show(stats.activeBuses), detail: loading ? null : `de ${countLabel(stats.totalBuses, 'micro', 'micros')}` },
    {
      icon: '🗺️',
      label: 'Rutas en servicio',
      value: show(stats.routesInService),
      detail: loading ? null : `de ${countLabel(stats.activeRoutes, 'ruta activa', 'rutas activas')}`,
    },
    {
      icon: '👥',
      label: 'Pasajeros a bordo',
      value: show(stats.passengersOnBoard),
      detail: loading || stats.activeCapacity === 0 ? null : `de ${countLabel(stats.activeCapacity, 'asiento', 'asientos')} en ruta`,
    },
    { icon: '📋', label: 'Reclamos pendientes', value: show(stats.pendingComplaints), detail: null },
  ];
}

/**
 * Dashboard de empresa, como CompanyDashboardPage del web: título, bajada y
 * las 4 tarjetas de KPIs, aquí con datos reales (el web aún muestra "—").
 * Debajo, accesos a la flota y a las rutas. Se recarga deslizando hacia abajo.
 */
export function CompanyDashboardScreen() {
  const { stats, loading, error, refresh } = useCompanyDashboard();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <PageTitle title="Dashboard" subtitle="KPIs y resumen de operaciones de la empresa" />

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.grid}>
          {dashboardCards(stats, loading).map(({ icon, label, value, detail }) => (
            <Card key={label} style={styles.kpi} testID={`kpi-${label}`}>
              <View accessible accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`} style={styles.kpiInner}>
                <Text style={styles.kpiIcon}>{icon}</Text>
                <Text style={styles.kpiLabel}>{label}</Text>
                <Text style={styles.kpiValue}>{value}</Text>
                {detail ? <Text style={styles.kpiDetail}>{detail}</Text> : null}
              </View>
            </Card>
          ))}
        </View>

        <ShortcutCard
          title="Administrar flota"
          detail={`${countLabel(stats.totalBuses, 'micro', 'micros')} de la empresa`}
          action="Ver flota ›"
          onPress={() => router.push('/company/buses' as Href)}
        />
        <ShortcutCard
          title="Consultar rutas"
          detail={countLabel(stats.activeRoutes, 'ruta activa', 'rutas activas')}
          action="Ver rutas ›"
          onPress={() => router.push('/company/routes' as Href)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ShortcutCard({ title, detail, action, onPress }: { title: string; detail: string; action: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${detail}`}>
      {({ pressed }) => (
        <Card style={[styles.shortcut, pressed && styles.shortcutPressed]}>
          <View style={styles.shortcutText}>
            <Text style={styles.shortcutTitle}>{title}</Text>
            <Text style={styles.shortcutDetail}>{detail}</Text>
          </View>
          <Text style={styles.link}>{action}</Text>
        </Card>
      )}
    </Pressable>
  );
}

// Tarjetas del web: --color-surface-1, borde, --radius-lg, --space-6 y centradas;
// rejilla de columnas de 200 px como mínimo (en el teléfono, una por fila).
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerBg,
  },
  errorText: { flex: 1, fontSize: font(14), lineHeight: font(20), color: colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  kpi: { flexGrow: 1, flexBasis: 200 },
  kpiInner: { alignItems: 'center' },
  kpiIcon: { fontSize: 32, lineHeight: 40 },
  kpiLabel: { marginTop: spacing.sm, fontSize: font(12), color: colors.muted, textAlign: 'center' },
  kpiValue: { fontSize: font(24), fontWeight: '700', color: colors.text },
  kpiDetail: { marginTop: 2, fontSize: font(12), color: colors.muted, textAlign: 'center' },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  shortcutPressed: { opacity: 0.8 },
  shortcutText: { flex: 1 },
  shortcutTitle: { fontSize: font(16), fontWeight: '700', color: colors.text },
  shortcutDetail: { marginTop: 2, fontSize: font(13), color: colors.muted },
  link: { fontSize: font(14), fontWeight: '700', color: colors.accent },
}));
