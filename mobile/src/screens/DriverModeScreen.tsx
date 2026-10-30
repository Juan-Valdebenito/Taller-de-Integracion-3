import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectField } from '../components/SelectField';
import { busOptionLabel, canDrive, routeOptionLabel } from '../company/driverTrip';
import { useDriverTrip } from '../hooks/useDriverTrip';
import { useRouteStops } from '../hooks/useRouteStops';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';

// Colores del web: --color-primary-400 (íconos y antetítulo) y --color-success.
const PRIMARY_400 = '#2b7cee';
const SUCCESS = '#22c55e';

/**
 * Modo conductor, como CompanyDriverModePage del web: "Operación en terreno",
 * estado de conexión y la tarjeta "Preparar recorrido" (unidad, recorrido,
 * resumen e "Iniciar recorrido"). El web usa micros y rutas de ejemplo; aquí
 * son las de la empresa y el recorrido cambia el estado de la micro en
 * backend-go. Con el recorrido iniciado se muestra su encabezado y "Finalizar".
 */
export function DriverModeScreen() {
  const driver = useDriverTrip();
  const { colors } = useTheme();
  const styles = useStyles();
  const connected = !driver.error;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={driver.loading} onRefresh={() => void driver.refresh()} tintColor={colors.accent} colors={[colors.primary]} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Operación en terreno</Text>
          <Text style={styles.title} accessibilityRole="header">Modo conductor</Text>
          <Text style={styles.subtitle}>Controla tu unidad y mantén informada la ruta.</Text>
          <View style={styles.connection} accessible accessibilityLabel={connected ? 'Conectado' : 'Sin conexión'}>
            <Ionicons name={connected ? 'wifi' : 'cloud-offline-outline'} size={14} color={connected ? SUCCESS : colors.danger} />
            <Text style={[styles.connectionText, { color: connected ? SUCCESS : colors.danger }]}>{connected ? 'Conectado' : 'Sin conexión'}</Text>
          </View>
        </View>

        {driver.error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{driver.error}</Text>
            <Pressable onPress={() => void driver.refresh()} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {driver.trip ? <ActiveTripCard driver={driver} /> : <SetupCard driver={driver} />}
      </ScrollView>
    </SafeAreaView>
  );
}

type Driver = ReturnType<typeof useDriverTrip>;

function SetupCard({ driver }: { driver: Driver }) {
  const styles = useStyles();
  const { buses, routes, selectedBus, selectedRoute, busy, loading, actionError } = driver;
  const stops = useRouteStops(selectedRoute?.id ?? null);
  const canStart = !!selectedBus && !!selectedRoute && !busy;

  return (
    <View style={styles.card}>
      <View style={styles.cardTitle}>
        <View style={styles.cardIcon}>
          <Ionicons name="bus" size={22} color={PRIMARY_400} />
        </View>
        <View style={styles.cardTitleText}>
          <Text style={styles.cardHeading} accessibilityRole="header">Preparar recorrido</Text>
          <Text style={styles.cardSubtitle}>Selecciona la unidad y el servicio que realizarás.</Text>
        </View>
      </View>

      {loading && buses.length === 0 ? <Text style={styles.muted}>Cargando flota...</Text> : null}
      {!loading && buses.length === 0 ? <Text style={styles.muted}>No hay micros asignadas a esta empresa.</Text> : null}

      {buses.length > 0 ? (
        <SelectField
          label="Unidad asignada"
          value={selectedBus?.id ?? ''}
          options={buses.map((bus) => ({ value: bus.id, label: busOptionLabel(bus), disabled: !canDrive(bus) }))}
          onChange={driver.selectBus}
        />
      ) : null}
      {buses.length > 0 && !selectedBus ? <Text style={styles.muted}>No hay micros disponibles para salir a recorrido.</Text> : null}

      {routes.length > 0 ? (
        <SelectField
          label="Recorrido"
          value={selectedRoute?.id ?? ''}
          options={routes.map((route) => ({ value: route.id, label: routeOptionLabel(route) }))}
          onChange={driver.selectRoute}
        />
      ) : !loading ? (
        <Text style={styles.muted}>No hay rutas activas para recorrer.</Text>
      ) : null}

      {selectedBus && selectedRoute ? (
        <View style={styles.summary}>
          <View style={styles.summaryItem} accessible accessibilityLabel={`${selectedBus.currentPassengers} de ${selectedBus.capacity} pasajeros`}>
            <Ionicons name="people" size={15} color={PRIMARY_400} />
            <Text style={styles.summaryText}>
              {selectedBus.currentPassengers}/{selectedBus.capacity} pasajeros
            </Text>
          </View>
          {!stops.loading && !stops.error ? (
            <View style={styles.summaryItem}>
              <Ionicons name="location" size={15} color={PRIMARY_400} />
              <Text style={styles.summaryText}>{countLabel(stops.stops.length, 'parada', 'paradas')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {actionError ? (
        <Text style={styles.actionError} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}

      <Pressable
        onPress={() => void driver.start()}
        disabled={!canStart}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Iniciando recorrido...' : 'Iniciar recorrido'}
        accessibilityState={{ disabled: !canStart, busy }}
        style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, !canStart && styles.disabled]}
      >
        <Ionicons name="play" size={16} color="#ffffff" />
        <Text style={styles.primaryActionText}>{busy ? 'Iniciando recorrido...' : 'Iniciar recorrido'}</Text>
      </Pressable>
    </View>
  );
}

function ActiveTripCard({ driver }: { driver: Driver }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const trip = driver.trip!;
  return (
    <View style={styles.card}>
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>En recorrido</Text>
      </View>
      <Text style={styles.cardHeading} accessibilityRole="header">Línea {trip.route.code}</Text>
      <Text style={styles.cardSubtitle}>
        {trip.route.name} · Unidad {trip.bus.patente}
      </Text>
      {driver.actionError ? (
        <Text style={styles.actionError} accessibilityRole="alert">
          {driver.actionError}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void driver.stop()}
        disabled={driver.busy}
        accessibilityRole="button"
        accessibilityLabel={driver.busy ? 'Finalizando...' : 'Finalizar'}
        style={({ pressed }) => [styles.stopAction, pressed && styles.pressed, driver.busy && styles.disabled]}
      >
        <Ionicons name="stop" size={14} color={colors.danger} />
        <Text style={styles.stopActionText}>{driver.busy ? 'Finalizando...' : 'Finalizar'}</Text>
      </Pressable>
    </View>
  );
}

// Medidas de CompanyDriverModePage.css (en pantallas angostas el web apila el encabezado).
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.lg },
  eyebrow: { color: PRIMARY_400, fontSize: font(12), fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { marginVertical: spacing.xs, color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: font(14), lineHeight: font(20) },
  connection: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 12 },
  connectionText: { fontSize: font(12), fontWeight: '600' },
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
  errorText: { flex: 1, color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  link: { color: colors.accent, fontSize: font(14), fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 20,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
  },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  cardIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: '#e8f0fd', // --color-primary-50
  },
  cardTitleText: { flex: 1 },
  cardHeading: { color: colors.text, fontSize: font(20), fontWeight: '700', marginBottom: spacing.xs },
  cardSubtitle: { color: colors.muted, fontSize: font(14), lineHeight: font(20) },
  muted: { color: colors.muted, fontSize: font(14), marginBottom: spacing.md },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingTop: spacing.xs, paddingBottom: 20 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryText: { color: colors.muted, fontSize: font(14) },
  actionError: { color: colors.danger, fontSize: font(14), lineHeight: font(20), marginBottom: spacing.md },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: { color: '#ffffff', fontSize: font(16), fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS, boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.15)' },
  liveText: { color: SUCCESS, fontSize: font(12), fontWeight: '700', textTransform: 'uppercase' },
  stopAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  stopActionText: { color: colors.danger, fontSize: font(14), fontWeight: '700' },
}));
