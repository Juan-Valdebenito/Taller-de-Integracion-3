import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CompanyBus, CompanyRoute } from '../api/companyApi';
import { Card } from '../components/Card';
import { PageTitle } from '../components/PageTitle';
import { useCompanyOperations } from '../hooks/useCompanyOperations';
import { useRouteStops } from '../hooks/useRouteStops';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';

/** "2 micros asignadas · 1 en ruta" para la tarjeta de la ruta. */
export function routeBusesLabel(route: CompanyRoute, buses: readonly CompanyBus[]): string {
  const assigned = buses.filter((bus) => bus.routeId === route.id);
  if (assigned.length === 0) return 'Sin micros asignadas';
  const active = assigned.filter((bus) => bus.status === 'ACTIVE').length;
  return `${countLabel(assigned.length, 'micro asignada', 'micros asignadas')} · ${active} en ruta`;
}

/**
 * Rutas de la empresa, como CompanyRoutesPage del web (que aún dice "🚧
 * Gestión de rutas, paradas y horarios"): una tarjeta por ruta con su código,
 * estado y micros asignadas; al tocarla muestra sus paraderos en orden.
 * backend-go no tiene horarios, así que no se muestran.
 */
export function CompanyRoutesScreen() {
  const { routes, buses, loading, error, refresh } = useCompanyOperations();
  const { colors } = useTheme();
  const styles = useStyles();
  const [openRouteId, setOpenRouteId] = useState<string | null>(null);
  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <PageTitle title="Rutas" subtitle="Rutas y paradas de la empresa" />
        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {!loading && !error && routes.length === 0 ? <Text style={styles.empty}>No hay rutas registradas para esta empresa.</Text> : null}
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            busesLabel={routeBusesLabel(route, buses)}
            open={openRouteId === route.id}
            onToggle={() => setOpenRouteId((current) => (current === route.id ? null : route.id))}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function RouteCard({ route, busesLabel, open, onToggle }: { route: CompanyRoute; busesLabel: string; open: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${route.code} ${route.name}, ${route.isActive ? 'activa' : 'inactiva'}`}
        accessibilityHint={open ? 'Oculta los paraderos' : 'Muestra los paraderos'}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.row}>
          <Text style={styles.code}>{route.code}</Text>
          <Text style={[styles.status, route.isActive ? styles.statusActive : styles.statusInactive]}>
            {route.isActive ? 'Activa' : 'Inactiva'}
          </Text>
        </View>
        <Text style={styles.title}>{route.name}</Text>
        {route.description ? <Text style={styles.detail}>{route.description}</Text> : null}
        <View style={styles.footer}>
          <Text style={styles.detail}>🚍 {busesLabel}</Text>
          <View style={styles.toggle}>
            <Text style={styles.link}>{open ? 'Ocultar paraderos' : 'Ver paraderos'}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
          </View>
        </View>
      </Pressable>
      {open ? <RouteStops routeId={route.id} /> : null}
    </Card>
  );
}

function RouteStops({ routeId }: { routeId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { stops, loading, error, reload } = useRouteStops(routeId);

  return (
    <View style={styles.stops}>
      {loading ? (
        <View style={styles.inline}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.detail}>Cargando paraderos...</Text>
        </View>
      ) : error ? (
        <View style={styles.inline} accessibilityRole="alert">
          <Text style={[styles.detail, styles.errorText]}>{error}</Text>
          <Pressable onPress={() => void reload()} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : stops.length === 0 ? (
        <Text style={styles.detail}>Esta ruta no tiene paraderos registrados.</Text>
      ) : (
        <View accessibilityLabel={`Paraderos de la ruta: ${stops.length}`}>
          <Text style={styles.stopsTitle}>{countLabel(stops.length, 'paradero', 'paraderos')}</Text>
          {stops.map((stop, index) => (
            <View key={stop.id} style={styles.stop}>
              <View style={styles.stopMarker}>
                <Text style={styles.stopNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.stopName}>{stop.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger },
  empty: { color: colors.muted, fontSize: font(14), paddingVertical: spacing.lg },
  card: { padding: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.accent, fontSize: font(14), fontWeight: '700' },
  status: { fontSize: font(11), fontWeight: '700', paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.full, overflow: 'hidden' },
  statusActive: { color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.13)' },
  statusInactive: { color: colors.muted, backgroundColor: colors.field },
  title: { marginTop: spacing.xs, color: colors.text, fontSize: font(17), fontWeight: '700' },
  detail: { marginTop: 2, color: colors.muted, fontSize: font(13), lineHeight: font(19) },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { color: colors.accent, fontSize: font(13), fontWeight: '700' },
  stops: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stopsTitle: { marginBottom: spacing.sm, color: colors.muted, fontSize: font(12), fontWeight: '600', textTransform: 'uppercase' },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stopNumber: { color: colors.onPrimary, fontSize: font(11), fontWeight: '700' },
  stopName: { flex: 1, color: colors.text, fontSize: font(14), lineHeight: font(20) },
}));
