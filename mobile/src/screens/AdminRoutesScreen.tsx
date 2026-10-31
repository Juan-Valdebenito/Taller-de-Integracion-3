import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EMPTY_ROUTE_FILTERS, filterRoutes, ROUTE_STATUS_OPTIONS, stopDotColor, type AdminRouteRow, type RouteFilters } from '../admin/routes';
import { FLEET_STATUS } from '../company/fleet';
import { SelectField } from '../components/SelectField';
import { useAdminRoutes } from '../hooks/useAdminRoutes';
import { useRouteStops } from '../hooks/useRouteStops';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';

// Colores del web: --color-primary-300/500, hsl(142,71%,45%) y hsl(220,10%,50%).
const PRIMARY_300 = '#5e9aed';
const PRIMARY_500 = '#1d6fe0';
const GREEN = '#22c55e';
const GREY = '#737d8c';

/**
 * Rutas del sistema (administrador), como AdminRoutesPage del web: buscador,
 * filtros por empresa y estado, y una tarjeta por ruta (la tabla del web no
 * cabe en un teléfono). Al tocarla muestra su recorrido de paraderos y sus
 * micros. La gestión (crear, editar, activar, eliminar) llega aparte.
 */
export function AdminRoutesScreen() {
  const { routes, companies, loading, error, refresh } = useAdminRoutes();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filters, setFilters] = useState<RouteFilters>(EMPTY_ROUTE_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Paraderos ya cargados por ruta (para el conteo y el total del encabezado).
  const [stopCounts, setStopCounts] = useState<Record<string, number>>({});
  const visible = useMemo(() => filterRoutes(routes, filters), [routes, filters]);
  const activeRoutes = routes.filter((route) => route.isActive).length;
  const loadedStops = Object.values(stopCounts).reduce((sum, n) => sum + n, 0);
  const onStopsLoaded = useCallback(
    (routeId: string, count: number) => setStopCounts((current) => (current[routeId] === count ? current : { ...current, [routeId]: count })),
    [],
  );
  const companyOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todas las empresas' }, ...companies.map((company) => ({ value: company.id, label: company.name }))],
    [companies],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <Text style={styles.title} accessibilityRole="header">Rutas del Sistema</Text>
        <Text style={styles.subtitle}>
          {activeRoutes} rutas activas · {loadedStops > 0 ? `${loadedStops} paraderos cargados` : 'paraderos bajo demanda'}
        </Text>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.search}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={filters.search}
            onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
            placeholder="Buscar por código o nombre..."
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Buscar ruta"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        <SelectField label="Empresa" value={filters.company} options={companyOptions} onChange={(company) => setFilters((f) => ({ ...f, company }))} />
        <SelectField label="Estado" value={filters.status} options={ROUTE_STATUS_OPTIONS} onChange={(status) => setFilters((f) => ({ ...f, status }))} />

        {loading && routes.length === 0 ? (
          <Text style={styles.empty}>Cargando rutas...</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{error ? '' : 'No se encontraron rutas'}</Text>
        ) : (
          visible.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              stopCount={stopCounts[route.id]}
              expanded={expandedId === route.id}
              onToggle={() => setExpandedId((current) => (current === route.id ? null : route.id))}
              onStopsLoaded={onStopsLoaded}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RouteCard({
  route,
  stopCount,
  expanded,
  onToggle,
  onStopsLoaded,
}: {
  route: AdminRouteRow;
  stopCount: number | undefined;
  expanded: boolean;
  onToggle: () => void;
  onStopsLoaded: (routeId: string, count: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const badgeColor = route.isActive ? GREEN : GREY;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Ruta ${route.code} ${route.name}, ${route.companyName}, ${route.isActive ? 'activa' : 'inactiva'}`}
        accessibilityHint={expanded ? 'Oculta los paraderos y micros' : 'Muestra los paraderos y micros'}
        accessibilityState={{ expanded }}
      >
        <View style={styles.cardTop}>
          <View style={styles.codeRow}>
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.placeholder} />
            <Text style={styles.code}>{route.code}</Text>
          </View>
          <Text style={[styles.badge, { color: badgeColor, backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}33` }]}>
            {route.isActive ? 'Activa' : 'Inactiva'}
          </Text>
        </View>
        <Text style={styles.name}>{route.name}</Text>
        <Text style={styles.description} numberOfLines={expanded ? undefined : 1}>
          {route.description || 'Sin descripción'}
        </Text>
        <Text style={styles.company}>🏢 {route.companyName}</Text>
        <View style={styles.counts}>
          <Text style={styles.count}>
            <Text style={styles.countValue}>{stopCount ?? '—'}</Text> paraderos
          </Text>
          <Text style={styles.count}>
            <Text style={styles.countValue}>{route.buses.length}</Text> micros
          </Text>
        </View>
      </Pressable>
      {expanded ? <RouteDetails route={route} onStopsLoaded={onStopsLoaded} /> : null}
    </View>
  );
}

function RouteDetails({ route, onStopsLoaded }: { route: AdminRouteRow; onStopsLoaded: (routeId: string, count: number) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { stops, loading, error, reload } = useRouteStops(route.id);

  // El conteo de la tarjeta y del encabezado se actualiza al cargar (no durante el dibujo).
  useEffect(() => {
    if (!loading && !error) onStopsLoaded(route.id, stops.length);
  }, [loading, error, stops.length, route.id, onStopsLoaded]);

  const dot = (index: number) => {
    const kind = stopDotColor(index, stops.length);
    return kind === 'first' ? PRIMARY_500 : kind === 'last' ? GREEN : colors.field;
  };

  return (
    <View style={styles.details}>
      <Text style={styles.detailsTitle}>Recorrido de paraderos</Text>
      {loading ? (
        <Text style={styles.muted}>Cargando paraderos y buses...</Text>
      ) : error ? (
        <View style={styles.inline} accessibilityRole="alert">
          <Text style={[styles.muted, { color: colors.danger, flex: 1 }]}>{error}</Text>
          <Pressable onPress={() => void reload()} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : stops.length === 0 ? (
        <Text style={styles.muted}>Esta ruta no tiene paraderos registrados.</Text>
      ) : (
        <View accessibilityLabel={`Recorrido de ${countLabel(stops.length, 'paradero', 'paraderos')}`}>
          {stops.map((stop, index) => (
            <View key={stop.id} style={styles.stop}>
              {index < stops.length - 1 ? <View style={styles.stopLine} /> : null}
              <View style={[styles.stopDot, { backgroundColor: dot(index) }]}>
                <Text style={styles.stopNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.stopName}>{stop.name}</Text>
              <Text style={styles.stopCoords}>
                {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.detailsTitle, styles.spaced]}>Micros asignadas</Text>
      {route.buses.length === 0 ? (
        <Text style={styles.muted}>Ninguna micro asignada a esta ruta.</Text>
      ) : (
        route.buses.map((bus) => {
          const status = FLEET_STATUS[bus.status] ?? FLEET_STATUS.INACTIVE;
          return (
            <View key={bus.id} style={styles.bus} accessible accessibilityLabel={`Micro ${bus.patente}, ${status.label.toLowerCase()}`}>
              <Text style={styles.plate}>🚍 {bus.patente}</Text>
              <Text style={[styles.busStatus, { color: status.color, backgroundColor: status.bg, borderColor: status.border }]}>{status.label}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

// Medidas de AdminRoutesPage del web.
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg, color: colors.muted, fontSize: font(14) },
  error: {
    marginBottom: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: { color: '#f87171', fontSize: font(14), lineHeight: font(20) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: font(14) },
  empty: { paddingVertical: 48, textAlign: 'center', color: colors.placeholder, fontSize: font(14) },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  code: { color: PRIMARY_300, fontSize: font(16), fontWeight: '800', fontFamily: 'monospace' },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    fontSize: font(11),
    fontWeight: '600',
    overflow: 'hidden',
  },
  name: { marginTop: spacing.xs, color: colors.text, fontSize: font(15), fontWeight: '600' },
  description: { marginTop: 2, color: colors.placeholder, fontSize: font(12), lineHeight: font(17) },
  company: { marginTop: spacing.sm, color: colors.muted, fontSize: font(12) },
  counts: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  count: { color: colors.placeholder, fontSize: font(12) },
  countValue: { color: colors.text, fontSize: font(14), fontWeight: '700' },
  details: {
    marginTop: spacing.md,
    marginHorizontal: -spacing.md,
    marginBottom: -spacing.md,
    padding: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    backgroundColor: 'rgba(30, 111, 224, 0.04)',
  },
  detailsTitle: { marginBottom: spacing.sm, color: colors.placeholder, fontSize: font(12), fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  spaced: { marginTop: spacing.md },
  muted: { color: colors.placeholder, fontSize: font(14) },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { color: colors.accent, fontSize: font(14), fontWeight: '700' },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: spacing.sm },
  stopLine: { position: 'absolute', left: 10, top: 28, bottom: -8, width: 2, backgroundColor: colors.border },
  stopDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  stopNumber: { color: '#ffffff', fontSize: font(10), fontWeight: '700' },
  stopName: { flex: 1, color: colors.muted, fontSize: font(14) },
  stopCoords: { color: colors.placeholder, fontSize: font(11), fontVariant: ['tabular-nums'] },
  bus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  plate: { color: colors.text, fontSize: font(14), fontWeight: '700' },
  busStatus: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.full, borderWidth: 1, fontSize: font(10), fontWeight: '800', overflow: 'hidden' },
}));
