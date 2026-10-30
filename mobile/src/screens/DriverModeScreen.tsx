import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectField } from '../components/SelectField';
import { busOptionLabel, canDrive, routeOptionLabel } from '../company/driverTrip';
import { useDriverTrip } from '../hooks/useDriverTrip';
import { useRouteStops } from '../hooks/useRouteStops';
import { useDriverLocation, type DriverLocationState } from '../hooks/useDriverLocation';
import { useElapsedMinutes, useTripProgress } from '../hooks/useTripProgress';
import type { ConnectionStatus } from '../realtime/types';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { countLabel } from '../utils/format';

// Colores del web: --color-primary-400 (íconos y antetítulo) y --color-success.
const PRIMARY_400 = '#2b7cee';
const PRIMARY_300 = '#5e9aed';
const SUCCESS = '#22c55e';
const WARNING = '#f59e0b';
const INFO = '#0ea5e9';

/**
 * Modo conductor, como CompanyDriverModePage del web: "Operación en terreno",
 * estado de conexión y la tarjeta "Preparar recorrido" (unidad, recorrido,
 * resumen e "Iniciar recorrido"). El web usa micros y rutas de ejemplo; aquí
 * son las de la empresa y el recorrido cambia el estado de la micro en
 * backend-go. Con el recorrido iniciado muestra la tarjeta "En recorrido":
 * progreso por los paraderos reales de la ruta, próxima parada, pasajeros,
 * tiempo transcurrido y paradas. Durante el recorrido el GPS del teléfono se
 * publica por el WebSocket (los pasajeros ven la micro moverse) y esa misma
 * posición hace avanzar el progreso.
 */
export function DriverModeScreen() {
  const driver = useDriverTrip();
  const location = useDriverLocation(driver.trip);
  const { colors } = useTheme();
  const styles = useStyles();
  const header = connectionLabel(!!driver.trip, location.connection, !driver.error);

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
          <View style={styles.connection} accessible accessibilityLabel={header.label}>
            <Ionicons name={header.icon} size={14} color={header.tone === 'ok' ? SUCCESS : header.tone === 'wait' ? WARNING : colors.danger} />
            <Text style={[styles.connectionText, { color: header.tone === 'ok' ? SUCCESS : header.tone === 'wait' ? WARNING : colors.danger }]}>
              {header.label}
            </Text>
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

        {driver.trip ? <ActiveTripCard driver={driver} location={location} /> : <SetupCard driver={driver} />}

        <View style={styles.hint}>
          <Ionicons name="checkmark-circle" size={14} color={SUCCESS} />
          <Text style={styles.hintText}>La ubicación se actualizará automáticamente mientras el recorrido esté activo.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Estado del encabezado. En recorrido es la conexión del WebSocket por donde
 * va la ubicación; antes, si se pudieron cargar los datos de la empresa.
 */
export function connectionLabel(
  inTrip: boolean,
  socket: ConnectionStatus,
  dataLoaded: boolean,
): { label: string; tone: 'ok' | 'wait' | 'off'; icon: keyof typeof Ionicons.glyphMap } {
  if (inTrip ? socket === 'connected' : dataLoaded) return { label: 'Conectado', tone: 'ok', icon: 'wifi' };
  if (inTrip && socket === 'connecting') return { label: 'Conectando...', tone: 'wait', icon: 'sync' };
  return { label: 'Sin conexión', tone: 'off', icon: 'cloud-offline-outline' };
}

type Driver = ReturnType<typeof useDriverTrip>;

/** Línea con el estado del envío de la ubicación, dentro de la tarjeta "En recorrido". */
function LocationStatus({ location }: { location: DriverLocationState }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (location.status === 'denied' || location.status === 'error') {
    return (
      <View style={[styles.locationRow, styles.locationProblem]} accessibilityRole="alert">
        <Ionicons name="location-outline" size={16} color={colors.danger} />
        <Text style={[styles.locationText, { color: colors.danger }]}>{location.error}</Text>
        <Pressable onPress={location.retry} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  let text: string;
  let tone: 'ok' | 'wait' | 'off' = 'wait';
  if (location.error) {
    text = location.error;
    tone = 'off';
  } else if (location.status !== 'tracking') {
    text = 'Buscando señal GPS...';
  } else if (location.connection !== 'connected') {
    text = 'Sin conexión con el servidor: se reintenta solo.';
    tone = 'off';
  } else if (location.lastSentAt === null) {
    text = 'Conectado: enviando la primera ubicación...';
  } else {
    text = `Ubicación enviada hace ${Math.max(0, Math.round((now - location.lastSentAt) / 1000))} s`;
    tone = 'ok';
  }
  const color = tone === 'ok' ? SUCCESS : tone === 'wait' ? WARNING : colors.danger;
  return (
    <View style={styles.locationRow} accessible accessibilityLabel={text} accessibilityLiveRegion="polite">
      <Ionicons name={tone === 'ok' ? 'radio' : 'locate'} size={16} color={color} />
      <Text style={[styles.locationText, { color }]}>{text}</Text>
    </View>
  );
}

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

function ActiveTripCard({ driver, location }: { driver: Driver; location: DriverLocationState }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const trip = driver.trip!;
  const { stops, loading, error, reload } = useRouteStops(trip.route.id);
  const progress = useTripProgress(trip.route.id, stops, location.position);
  const minutes = useElapsedMinutes(trip.startedAt);
  // Pasajeros al día: la micro se vuelve a leer del backend al refrescar.
  const passengers = driver.buses.find((bus) => bus.id === trip.bus.id)?.currentPassengers ?? trip.bus.currentPassengers;
  const nextStop = progress.nextIndex === null ? null : stops[progress.nextIndex];

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
        <Text style={[styles.actionError, styles.spaced]} accessibilityRole="alert">
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

      <LocationStatus location={location} />

      {loading ? (
        <Text style={[styles.muted, styles.spaced]}>Cargando paraderos...</Text>
      ) : error ? (
        <View style={[styles.inline, styles.spaced]} accessibilityRole="alert">
          <Text style={[styles.muted, styles.errorInline]}>{error}</Text>
          <Pressable onPress={() => void reload()} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : stops.length === 0 ? (
        <Text style={[styles.muted, styles.spaced]}>Esta ruta no tiene paraderos registrados.</Text>
      ) : (
        <>
          <View style={styles.progress} accessible accessibilityLabel={`Progreso del recorrido: ${progress.percent}%`}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>Inicio del recorrido</Text>
              <Text style={styles.progressPercent}>{progress.percent}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progress.percent}%` }]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progressStops}>
              {stops.map((stop, index) => (
                <Text key={stop.id} style={[styles.progressStop, progress.isPassed(index) && styles.progressStopPassed]} numberOfLines={2}>
                  {stop.name}
                </Text>
              ))}
            </ScrollView>
          </View>

          <View style={styles.nextStop} accessible accessibilityLabel={nextStop ? `Próxima parada: ${nextStop.name}` : 'Recorrido completado'}>
            <View style={styles.nextStopIcon}>
              <Ionicons name={nextStop ? 'location' : 'flag'} size={18} color={INFO} />
            </View>
            <View style={styles.nextStopText}>
              <Text style={styles.nextStopLabel}>{nextStop ? 'Próxima parada' : 'Fin del recorrido'}</Text>
              <Text style={styles.nextStopName}>{nextStop ? nextStop.name : 'Pasaste por todas las paradas'}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
          </View>
        </>
      )}

      <View style={styles.stats}>
        <Stat icon="people" value={String(passengers)} label="Pasajeros" />
        <Stat icon="time" value={`${minutes} min`} label="Transcurrido" />
        <Stat icon="git-commit" value={String(stops.length)} label="Paradas" />
      </View>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={16} color={PRIMARY_400} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  spaced: { marginTop: spacing.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  locationProblem: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  locationText: { flex: 1, fontSize: font(13), lineHeight: font(18) },
  // .driver-mode__hint del web.
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: 20, paddingHorizontal: spacing.md },
  hintText: { flexShrink: 1, color: colors.placeholder, fontSize: font(12), textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorInline: { flex: 1, color: colors.danger, marginBottom: 0 },
  progress: { marginTop: spacing.xl, marginBottom: spacing.lg },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  progressLabel: { color: colors.muted, fontSize: font(12) },
  progressPercent: { color: PRIMARY_300, fontSize: font(12), fontWeight: '700' },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.field, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: radius.full, backgroundColor: PRIMARY_400 },
  progressStops: { gap: spacing.sm, marginTop: spacing.sm },
  progressStop: { width: 80, color: colors.placeholder, fontSize: font(10), textAlign: 'center' },
  progressStopPassed: { color: colors.muted, fontWeight: '600' },
  nextStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.35)',
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
  },
  nextStopIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  nextStopText: { flex: 1 },
  nextStopLabel: { color: colors.muted, fontSize: font(12) },
  nextStopName: { marginTop: 2, color: colors.text, fontSize: font(16), fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 12, marginTop: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 2, padding: 12, borderRadius: radius.md, backgroundColor: colors.field },
  statValue: { marginTop: spacing.xs, color: colors.text, fontSize: font(18), fontWeight: '700' },
  statLabel: { color: colors.placeholder, fontSize: font(11) },
}));
