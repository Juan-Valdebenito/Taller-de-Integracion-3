import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteRoute, updateRoute } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { DELETE_ROUTE_FAILED } from '../admin/routeForm';
import { EMPTY_ROUTE_FILTERS, filterRoutes, ROUTE_STATUS_OPTIONS, stopDotColor, type AdminRouteRow, type RouteFilters } from '../admin/routes';
import { FLEET_STATUS } from '../company/fleet';
import { RouteForm } from '../components/RouteForm';
import { SelectField } from '../components/SelectField';
import { useAdminRoutes } from '../hooks/useAdminRoutes';
import { useRouteStops } from '../hooks/useRouteStops';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';
import { confirmAction } from '../utils/platform';

// Colores del web: --color-primary-300/500, hsl(142,71%,45%) y hsl(220,10%,50%).
const PRIMARY_300 = '#5e9aed';
const PRIMARY_500 = '#1d6fe0';
const GREEN = '#22c55e';
const GREY = '#737d8c';
const AMBER = '#f59e0b';
const RED = '#ef4444';

/**
 * Rutas del sistema (administrador), como AdminRoutesPage del web: buscador,
 * filtros por empresa y estado, y una tarjeta por ruta (la tabla del web no
 * cabe en un teléfono). Al tocarla muestra su recorrido de paraderos y sus
 * micros. Con "Nueva ruta", "Editar", "Activar/Desactivar" y "Eliminar"
 * como los botones de la tabla del web.
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
  // Formulario: cerrado (false), nueva ruta (null) o editando una.
  const [editing, setEditing] = useState<AdminRouteRow | null | false>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const onSaved = (message: string) => {
    setEditing(false);
    setToast(message);
    void refresh();
  };

  // Como el web: PUT con todos los campos y el estado invertido.
  const toggleActive = async (route: AdminRouteRow) => {
    setBusyId(route.id);
    setActionError(null);
    try {
      await updateRoute(route.id, { code: route.code, name: route.name, description: route.description ?? null, isActive: !route.isActive });
      setToast(`Ruta ${route.code} ${route.isActive ? 'desactivada' : 'activada'}`);
      void refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado de la ruta.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (route: AdminRouteRow) => {
    setBusyId(route.id);
    setActionError(null);
    try {
      await deleteRoute(route.id);
      setExpandedId((current) => (current === route.id ? null : current));
      setStopCounts(({ [route.id]: _removed, ...rest }) => rest);
      setToast(`Ruta ${route.code} eliminada`);
      void refresh();
    } catch {
      setActionError(DELETE_ROUTE_FAILED);
    } finally {
      setBusyId(null);
    }
  };

  const requestDelete = (route: AdminRouteRow) =>
    confirmAction({
      title: '🗑️ Eliminar Ruta',
      message: `¿Estás seguro de que deseas eliminar la ruta ${route.code} – ${route.name}? Esta acción no se puede deshacer.\n\nSus paraderos se eliminan y sus micros quedan sin ruta asignada.`,
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: () => void remove(route),
    });

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
        {toast ? (
          <LinearGradient colors={['#1f9d4f', '#167a3c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toast}>
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={styles.toastText} accessibilityRole="alert">
              {toast}
            </Text>
          </LinearGradient>
        ) : null}

        <Text style={styles.title} accessibilityRole="header">Rutas del Sistema</Text>
        <Text style={styles.subtitle}>
          {activeRoutes} rutas activas · {loadedStops > 0 ? `${loadedStops} paraderos cargados` : 'paraderos bajo demanda'}
        </Text>
        <Pressable
          onPress={() => setEditing(null)}
          accessibilityRole="button"
          accessibilityLabel="Nueva ruta"
          style={({ pressed }) => [styles.newWrap, pressed && styles.dimmed]}
        >
          <LinearGradient colors={['#1d6fe0', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newButton}>
            <Text style={styles.newText}>➕ Nueva ruta</Text>
          </LinearGradient>
        </Pressable>

        {error || actionError ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error ?? actionError}</Text>
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
              busy={busyId === route.id}
              onEdit={() => setEditing(route)}
              onToggleActive={() => void toggleActive(route)}
              onDelete={() => requestDelete(route)}
            />
          ))
        )}
      </ScrollView>
      <RouteForm
        visible={editing !== false}
        route={editing || null}
        routes={routes}
        companies={companies}
        onClose={() => setEditing(false)}
        onSaved={onSaved}
      />
    </SafeAreaView>
  );
}

function RouteCard({
  route,
  stopCount,
  expanded,
  onToggle,
  onStopsLoaded,
  busy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  route: AdminRouteRow;
  stopCount: number | undefined;
  expanded: boolean;
  onToggle: () => void;
  onStopsLoaded: (routeId: string, count: number) => void;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
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
      <View style={styles.actions}>
        <Pressable
          onPress={onEdit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Editar ruta ${route.code}`}
          style={({ pressed }) => [styles.action, styles.editAction, (pressed || busy) && styles.dimmed]}
        >
          <Text style={styles.editText}>✏️ Editar</Text>
        </Pressable>
        <Pressable
          onPress={onToggleActive}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${route.isActive ? 'Desactivar' : 'Activar'} ruta ${route.code}`}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.action, route.isActive ? styles.offAction : styles.onAction, (pressed || busy) && styles.dimmed]}
        >
          <Text style={[styles.actionText, { color: route.isActive ? AMBER : GREEN }]}>
            {busy ? 'Guardando...' : route.isActive ? '⏸️ Desactivar' : '▶️ Activar'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ruta ${route.code}`}
          style={({ pressed }) => [styles.action, styles.deleteAction, (pressed || busy) && styles.dimmed]}
        >
          <Text style={[styles.actionText, { color: RED }]}>🗑️ Eliminar</Text>
        </Pressable>
      </View>
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
  subtitle: { marginTop: spacing.xs, color: colors.muted, fontSize: font(14) },
  newWrap: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.lg },
  newButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md },
  newText: { color: '#ffffff', fontSize: font(14), fontWeight: '700' },
  dimmed: { opacity: 0.7 },
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  editAction: { borderColor: colors.border, backgroundColor: colors.field },
  editText: { color: colors.muted, fontSize: font(12) },
  offAction: { borderColor: 'rgba(245, 158, 11, 0.3)', backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  onAction: { borderColor: 'rgba(34, 197, 94, 0.3)', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
  deleteAction: { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  actionText: { fontSize: font(12) },
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
