// ============================================================
// Tab 2 — Modo Conductor
// Core driver workflow: select bus → select route → start trip
// Shows live trip info when a recorrido is active
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES, MOCK_ROUTES } from '@/data/mockData';
import type { DriverBus, DriverRoute } from '@/types';

const theme = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

// ── Main Screen ─────────────────────────────────────────────
export default function DriverModeScreen() {
  const [selectedBusId, setSelectedBusId] = useState(MOCK_BUSES[0].id);
  const [selectedRouteId, setSelectedRouteId] = useState(MOCK_ROUTES[0].id);
  const [isTripActive, setIsTripActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const selectedBus = useMemo(
    () => MOCK_BUSES.find((b) => b.id === selectedBusId) ?? MOCK_BUSES[0],
    [selectedBusId],
  );
  const selectedRoute = useMemo(
    () => MOCK_ROUTES.find((r) => r.id === selectedRouteId) ?? MOCK_ROUTES[0],
    [selectedRouteId],
  );

  const durationMinutes = parseInt(selectedRoute.duration, 10) || 1;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const progress = Math.min(100, Math.round((elapsedMinutes / durationMinutes) * 100));
  const nextStopIndex = Math.min(
    selectedRoute.stops.length - 1,
    Math.floor(progress / (100 / selectedRoute.stops.length)),
  );

  // Timer for elapsed seconds (updates every second for a live feel)
  useEffect(() => {
    if (!isTripActive) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTripActive]);

  const handleStartTrip = () => {
    setElapsedSeconds(0);
    setIsTripActive(true);
  };

  const handleStopTrip = () => {
    setIsTripActive(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Operación en terreno</Text>
          <Text style={styles.title}>Modo Conductor</Text>
          <Text style={styles.subtitle}>
            Controla tu unidad y mantén informada la ruta.
          </Text>
        </View>
        <ConnectionBadge />
      </View>

      {!isTripActive ? (
        <SetupCard
          buses={MOCK_BUSES}
          routes={MOCK_ROUTES}
          selectedBus={selectedBus}
          selectedRoute={selectedRoute}
          onBusSelect={setSelectedBusId}
          onRouteSelect={setSelectedRouteId}
          onStart={handleStartTrip}
        />
      ) : (
        <ActiveTripCard
          bus={selectedBus}
          route={selectedRoute}
          progress={progress}
          elapsedSeconds={elapsedSeconds}
          nextStopIndex={nextStopIndex}
          onStop={handleStopTrip}
        />
      )}

      {/* Hint */}
      <View style={styles.hint}>
        <Ionicons name="checkmark-circle" size={14} color={theme.success} />
        <Text style={styles.hintText}>
          La ubicación se actualizará automáticamente mientras el recorrido esté activo.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Connection Badge ────────────────────────────────────────
function ConnectionBadge() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.connectionBadge}>
      <Animated.View style={[styles.connDot, { opacity: pulseAnim }]} />
      <Text style={styles.connText}>Conectado</Text>
    </View>
  );
}

// ── Setup Card (pre-trip) ───────────────────────────────────
function SetupCard({
  buses,
  routes,
  selectedBus,
  selectedRoute,
  onBusSelect,
  onRouteSelect,
  onStart,
}: {
  buses: DriverBus[];
  routes: DriverRoute[];
  selectedBus: DriverBus;
  selectedRoute: DriverRoute;
  onBusSelect: (id: string) => void;
  onRouteSelect: (id: string) => void;
  onStart: () => void;
}) {
  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="bus" size={22} color={theme.primary300} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Preparar recorrido</Text>
          <Text style={styles.cardSubtitle}>
            Selecciona la unidad y el servicio que realizarás.
          </Text>
        </View>
      </View>

      {/* Bus selector */}
      <Text style={styles.fieldLabel}>Unidad asignada</Text>
      <View style={styles.selectorList}>
        {buses.map((bus) => {
          const isSelected = bus.id === selectedBus.id;
          const isDisabled = bus.status === 'Mantenimiento';
          const statusColor =
            bus.status === 'Disponible'
              ? theme.success
              : bus.status === 'En servicio'
              ? theme.info
              : theme.warning;

          return (
            <Pressable
              key={bus.id}
              onPress={() => !isDisabled && onBusSelect(bus.id)}
              style={({ pressed }) => [
                styles.busOption,
                isSelected && styles.busOptionActive,
                isDisabled && styles.busOptionDisabled,
                pressed && !isDisabled && { opacity: 0.8 },
              ]}
            >
              <Ionicons
                name="bus"
                size={18}
                color={isSelected ? theme.primary300 : theme.textMuted}
              />
              <Text
                style={[
                  styles.busPlate,
                  isSelected && { color: theme.textPrimary },
                  isDisabled && { color: theme.textMuted },
                ]}
              >
                {bus.plate}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <View style={[styles.statusBadgeDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                  {bus.status}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Route selector */}
      <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Recorrido</Text>
      <View style={styles.selectorList}>
        {routes.map((route) => {
          const isSelected = route.id === selectedRoute.id;
          return (
            <Pressable
              key={route.id}
              onPress={() => onRouteSelect(route.id)}
              style={({ pressed }) => [
                styles.routeOption,
                isSelected && styles.routeOptionActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.routeCodeBadge, isSelected && styles.routeCodeBadgeActive]}>
                <Text style={[styles.routeCode, isSelected && { color: '#fff' }]}>
                  {route.code}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.routeOptionName, isSelected && { color: theme.textPrimary }]}
                >
                  {route.name}
                </Text>
                <Text style={styles.routeOptionMeta}>
                  {route.stops.length} paradas · {route.duration}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary300} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Ionicons name="people" size={16} color={theme.primary300} />
          <Text style={styles.summaryText}>
            {selectedBus.passengers}/{selectedBus.capacity} pasajeros
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Ionicons name="time" size={16} color={theme.primary300} />
          <Text style={styles.summaryText}>{selectedRoute.duration}</Text>
        </View>
      </View>

      {/* Start button */}
      <Pressable
        onPress={onStart}
        disabled={selectedBus.status === 'Mantenimiento'}
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          selectedBus.status === 'Mantenimiento' && styles.primaryBtnDisabled,
        ]}
      >
        <Ionicons name="play" size={20} color="#fff" />
        <Text style={styles.primaryBtnText}>Iniciar recorrido</Text>
      </Pressable>
    </View>
  );
}

// ── Active Trip Card ────────────────────────────────────────
function ActiveTripCard({
  bus,
  route,
  progress,
  elapsedSeconds,
  nextStopIndex,
  onStop,
}: {
  bus: DriverBus;
  route: DriverRoute;
  progress: number;
  elapsedSeconds: number;
  nextStopIndex: number;
  onStop: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const elapsedSec = elapsedSeconds % 60;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <View style={[styles.card, styles.cardActive]}>
      {/* Live heading */}
      <View style={styles.liveHeading}>
        <View style={{ flex: 1 }}>
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
            <Text style={styles.liveBadgeText}>En recorrido</Text>
          </View>
          <Text style={styles.liveTitle}>Línea {route.code}</Text>
          <Text style={styles.liveSubtitle}>
            {route.name} · Unidad {bus.plate}
          </Text>
        </View>
        <Pressable
          onPress={onStop}
          style={({ pressed }) => [
            styles.stopBtn,
            pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
          ]}
        >
          <Ionicons name="stop" size={16} color={theme.danger} />
          <Text style={styles.stopBtnText}>Finalizar</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabelStart}>Inicio del recorrido</Text>
          <Text style={styles.progressPercent}>{progress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.stopsRow}>
          {route.stops.map((stop, i) => (
            <Text
              key={stop}
              style={[styles.stopLabel, i <= nextStopIndex && styles.stopLabelPassed]}
              numberOfLines={1}
            >
              {stop}
            </Text>
          ))}
        </View>
      </View>

      {/* Next stop highlight */}
      <View style={styles.nextStop}>
        <View style={styles.nextStopIcon}>
          <Ionicons name="location" size={20} color={theme.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nextStopLabel}>Próxima parada</Text>
          <Text style={styles.nextStopName}>{route.stops[nextStopIndex]}</Text>
        </View>
        <Ionicons name="checkmark-circle" size={22} color={theme.success} />
      </View>

      {/* Real-time stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statsItem}>
          <Ionicons name="people" size={20} color={theme.primary300} />
          <Text style={styles.statsValue}>{bus.passengers}</Text>
          <Text style={styles.statsLabel}>Pasajeros</Text>
        </View>
        <View style={styles.statsItem}>
          <Ionicons name="time" size={20} color={theme.primary300} />
          <Text style={styles.statsValue}>
            {elapsedMin}:{elapsedSec.toString().padStart(2, '0')}
          </Text>
          <Text style={styles.statsLabel}>Transcurrido</Text>
        </View>
        <View style={styles.statsItem}>
          <Ionicons name="navigate" size={20} color={theme.primary300} />
          <Text style={styles.statsValue}>{route.stops.length}</Text>
          <Text style={styles.statsLabel}>Paradas</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgDeep },
  content: { padding: spacing.lg, paddingBottom: spacing['5xl'] },

  // Header
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 20,
  },

  // Connection badge
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.success,
  },
  connText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.success,
  },

  // Card
  card: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardActive: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },

  // Field label
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },

  // Bus selector list
  selectorList: { gap: spacing.sm },
  busOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  busOptionActive: {
    borderColor: theme.primary400,
    backgroundColor: 'rgba(59, 122, 219, 0.08)',
  },
  busOptionDisabled: {
    opacity: 0.45,
  },
  busPlate: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Route selector
  routeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface2,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  routeOptionActive: {
    borderColor: theme.primary400,
    backgroundColor: 'rgba(59, 122, 219, 0.08)',
  },
  routeCodeBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCodeBadgeActive: {
    backgroundColor: theme.primary400,
  },
  routeCode: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: theme.primary300,
  },
  routeOptionName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  routeOptionMeta: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },

  // Primary button
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: theme.primary500,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  primaryBtnText: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },

  // Active trip
  liveHeading: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.success,
  },
  liveBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  liveSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  stopBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.danger,
  },

  // Progress
  progressSection: { marginBottom: spacing['2xl'] },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabelStart: { fontSize: fontSize.xs, color: theme.textSecondary },
  progressPercent: { fontSize: fontSize.xs, fontWeight: '700', color: theme.primary300 },
  progressTrack: {
    height: 8,
    backgroundColor: theme.surface3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary400,
    borderRadius: radius.full,
  },
  stopsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  stopLabel: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    maxWidth: '25%',
  },
  stopLabelPassed: { color: theme.textSecondary, fontWeight: '600' },

  // Next stop
  nextStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.25)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  nextStopIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStopLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
  nextStopName: { fontSize: fontSize.base, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.surface2,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  statsValue: { fontSize: fontSize.lg, fontWeight: '800', color: theme.textPrimary },
  statsLabel: { fontSize: 10, color: theme.textMuted },

  // Hint
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  hintText: { fontSize: fontSize.xs, color: theme.textMuted, textAlign: 'center' },
});
