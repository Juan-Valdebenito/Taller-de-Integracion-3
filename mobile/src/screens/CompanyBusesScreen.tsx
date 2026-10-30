import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CompanyBus, CompanyRoute } from '../api/companyApi';
import { SelectField } from '../components/SelectField';
import {
  avgOccupancyColor,
  EMPTY_FLEET_FILTERS,
  filterFleet,
  FLEET_STATUS,
  FLEET_STATUS_FILTER,
  fleetStats,
  occupancyBarColor,
  occupancyOf,
  occupancyTextColor,
  type FleetFilters,
} from '../company/fleet';
import { useCompanyOperations } from '../hooks/useCompanyOperations';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const SKY = '#38bdf8';
const PRIMARY_400 = '#2b7cee';

/**
 * Flota de micros de la empresa, como CompanyBusesPage del web: encabezado con
 * "Sincronizar", las 5 tarjetas de cifras, filtros por línea, estado y
 * patente, y una tarjeta por micro (la tabla del web no cabe en un teléfono).
 * A diferencia del web, nunca muestra micros de ejemplo si el backend falla.
 */
export function CompanyBusesScreen() {
  const { buses, routes, loading, error, refresh } = useCompanyOperations();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filters, setFilters] = useState<FleetFilters>(EMPTY_FLEET_FILTERS);
  const stats = useMemo(() => fleetStats(buses), [buses]);
  const visible = useMemo(() => filterFleet(buses, filters), [buses, filters]);
  const routeOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todas las líneas' },
      ...routes.map((route) => ({ value: route.id, label: `Línea ${route.code} – ${route.name}` })),
      { value: 'NONE', label: 'Sin ruta asignada' },
    ],
    [routes],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <Text style={styles.title} accessibilityRole="header">Gestión de Flota de Micros</Text>
        <Text style={styles.subtitle}>Administración de vehículos, asignación de rutas operativas y control de aforo en tiempo real.</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => void refresh()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sincronizar"
            style={({ pressed }) => [styles.syncButton, (pressed || loading) && styles.dimmed]}
          >
            <Ionicons name="sync" size={15} color={colors.text} />
            <Text style={styles.syncText}>{loading ? 'Sincronizando...' : 'Sincronizar'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.kpis}>
          <Kpi label="Flota Total" icon="bus" color={SKY} labelColor={colors.muted} valueColor={colors.text} value={stats.total} detail="Micros registradas" />
          <Kpi label="En Servicio" icon="checkmark-circle" color="#4ade80" value={stats.active} detail="Circulando en ruta" />
          <Kpi label="En Taller" icon="construct" color="#facc15" value={stats.maintenance} detail="Mantenimiento técnico" />
          <Kpi label="En Reserva / Parada" icon="power" color="#94a3b8" value={stats.reserve} detail="Fuera de turno" />
          <View style={styles.kpi} accessible accessibilityLabel={`Aforo Promedio: ${stats.avgOccupancy}%`}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiLabel, { color: PRIMARY_400 }]}>Aforo Promedio</Text>
              <Ionicons name="people" size={18} color={PRIMARY_400} />
            </View>
            <Text style={styles.kpiValue}>{stats.avgOccupancy}%</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.min(100, stats.avgOccupancy)}%`, backgroundColor: avgOccupancyColor(stats.avgOccupancy) }]} />
            </View>
          </View>
        </View>

        <View style={styles.filters}>
          <View style={styles.filtersTitle}>
            <Ionicons name="filter" size={14} color={colors.muted} />
            <Text style={styles.filtersTitleText}>Filtrar Flota:</Text>
          </View>
          <SelectField label="Línea Asignada" value={filters.route} options={routeOptions} onChange={(route) => setFilters((f) => ({ ...f, route }))} />
          <SelectField label="Estado Operacional" value={filters.status} options={FLEET_STATUS_FILTER} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
          <Text style={styles.filterLabel}>Buscar Micro</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={14} color={colors.placeholder} />
            <TextInput
              value={filters.search}
              onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
              placeholder="Buscar por patente (ej: BGPK-45)..."
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Buscar Micro"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Listado de Vehículos ({visible.length})</Text>
          <Text style={styles.listSubtitle}>Actualización automática de estado y aforo</Text>
        </View>
        {loading && buses.length === 0 ? (
          <Text style={styles.empty}>Cargando flota de micros...</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>
            {buses.length === 0 && !error ? 'No hay micros registradas para esta empresa.' : 'No se encontraron micros con los criterios seleccionados.'}
          </Text>
        ) : (
          visible.map((bus) => <BusCard key={bus.id} bus={bus} route={routes.find((route) => route.id === bus.routeId)} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({
  label,
  icon,
  color,
  labelColor = color,
  valueColor = color,
  value,
  detail,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  labelColor?: string;
  valueColor?: string;
  value: number;
  detail: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.kpiHeader}>
        <Text style={[styles.kpiLabel, { color: labelColor }]}>{label}</Text>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.kpiDetail}>{detail}</Text>
    </View>
  );
}

function BusCard({ bus, route }: { bus: CompanyBus; route: CompanyRoute | undefined }) {
  const styles = useStyles();
  const status = FLEET_STATUS[bus.status] ?? FLEET_STATUS.INACTIVE;
  const pct = occupancyOf(bus);
  return (
    <View style={styles.bus} accessible accessibilityLabel={`Micro ${bus.patente}, ${route ? `Línea ${route.code}` : 'sin ruta asignada'}, ${status.label.toLowerCase()}, ${pct}% de aforo`}>
      <View style={styles.busTop}>
        <Text style={styles.plate}>{bus.patente}</Text>
        <Text style={[styles.status, { color: status.color, backgroundColor: status.bg, borderColor: status.border }]}>{status.label}</Text>
      </View>
      <View style={styles.busRow}>
        {route ? <Text style={styles.line}>Línea {route.code}</Text> : <Text style={styles.noRoute}>Sin asignar</Text>}
        <Text style={styles.capacity}>{bus.capacity} asientos</Text>
      </View>
      <View style={styles.occupancyLabels}>
        <Text style={styles.occupancyText}>
          {bus.currentPassengers ?? 0} / {bus.capacity}
        </Text>
        <Text style={[styles.occupancyText, { color: occupancyTextColor(pct) }]}>{pct}%</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: occupancyBarColor(pct) }]} />
      </View>
    </View>
  );
}

// Medidas de CompanyBusesPage del web (tarjetas --radius-xl, etiquetas 11 px en mayúsculas).
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: font(14), lineHeight: font(20) },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.md, marginBottom: spacing.lg },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  syncText: { color: colors.text, fontSize: font(13), fontWeight: '600' },
  dimmed: { opacity: 0.7 },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  kpi: {
    flexGrow: 1,
    flexBasis: 150,
    padding: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kpiLabel: { flexShrink: 1, fontSize: font(11), fontWeight: '700', textTransform: 'uppercase' },
  kpiValue: { marginTop: spacing.sm, color: colors.text, fontSize: font(30), fontWeight: '800' },
  kpiDetail: { marginTop: spacing.xs, color: colors.muted, fontSize: font(12) },
  bar: { height: 6, marginTop: spacing.sm, borderRadius: radius.full, backgroundColor: colors.field, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.full },
  filters: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filtersTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 12 },
  filtersTitleText: { color: colors.muted, fontSize: font(13), fontWeight: '700' },
  filterLabel: { fontSize: font(13), lineHeight: font(21), fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.field,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.text, fontSize: font(14) },
  listHeader: { marginBottom: spacing.md },
  listTitle: { color: colors.text, fontSize: font(14), fontWeight: '700' },
  listSubtitle: { marginTop: 2, color: colors.muted, fontSize: font(12) },
  empty: { paddingVertical: 40, textAlign: 'center', color: colors.muted, fontSize: font(14) },
  bus: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  busTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  plate: { color: colors.text, fontSize: font(16), fontWeight: '800', letterSpacing: 0.5 },
  status: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    fontSize: font(10),
    fontWeight: '800',
    overflow: 'hidden',
  },
  busRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  line: { color: SKY, fontSize: font(13), fontWeight: '700' },
  noRoute: { color: colors.placeholder, fontSize: font(12) },
  capacity: { color: colors.text, fontSize: font(13), fontWeight: '600' },
  occupancyLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  occupancyText: { color: colors.text, fontSize: font(11), fontWeight: '600' },
}));
