// ============================================================
// Tab 2 — Modo Conductor / Empresa
// Premium driver workflow: select bus → select route → start trip
// Full-featured live trip dashboard with timeline, passenger
// counters, speed, ETA, and animated status indicators
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES, MOCK_ROUTES, DRIVER_PROFILE, TRIP_HISTORY, ALERT_EVENTS } from '@/data/mockData';
import type { DriverBus, DriverRoute } from '@/types';

const theme = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

// ── Gradient Button (reusable) ──────────────────────────────
function GradientButton({
  onPress,
  disabled = false,
  icon,
  label,
  colors = [theme.primary500, theme.primary400],
  danger = false,
}: {
  onPress: () => void;
  disabled?: boolean;
  icon: string;
  label: string;
  colors?: string[];
  danger?: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const actualColors = danger ? ['#DC2626', '#EF4444'] : colors;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() =>
          Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()
        }
      >
        <View style={[styles.gradientBtn, { backgroundColor: actualColors[0] }]}>
          <View style={styles.gradientBtnOverlay}>
            <Ionicons name={icon as any} size={20} color="#fff" />
            <Text style={styles.gradientBtnText}>{label}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main Screen ─────────────────────────────────────────────
export default function DriverModeScreen() {
  const [selectedBusId, setSelectedBusId] = useState(MOCK_BUSES[0].id);
  const [selectedRouteId, setSelectedRouteId] = useState(MOCK_ROUTES[0].id);
  const [isTripActive, setIsTripActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPassengers, setCurrentPassengers] = useState(0);
  const [showBusModal, setShowBusModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showTripHistory, setShowTripHistory] = useState(false);

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
  const eta = Math.max(0, durationMinutes - elapsedMinutes);

  // Timer for elapsed seconds
  useEffect(() => {
    if (!isTripActive) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTripActive]);

  const handleStartTrip = useCallback(() => {
    setElapsedSeconds(0);
    setCurrentPassengers(selectedBus.passengers);
    setIsTripActive(true);
  }, [selectedBus]);

  const handleStopTrip = useCallback(() => {
    setIsTripActive(false);
  }, []);

  const handlePassengerChange = useCallback((delta: number) => {
    setCurrentPassengers((p) => Math.max(0, Math.min(selectedBus.capacity, p + delta)));
  }, [selectedBus.capacity]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ─────────────────────────────────────── */}
        <DriverHeader />

        {/* ─── Status Hero ────────────────────────────────── */}
        <StatusHero isTripActive={isTripActive} route={selectedRoute} bus={selectedBus} />

        {!isTripActive ? (
          <>
            {/* ─── Setup Section ──────────────────────────── */}
            <SetupSection
              bus={selectedBus}
              route={selectedRoute}
              onBusPress={() => setShowBusModal(true)}
              onRoutePress={() => setShowRouteModal(true)}
              onStart={handleStartTrip}
            />

            {/* ─── Today's Stats ──────────────────────────── */}
            <TodayStats />

            {/* ─── Recent Trips ──────────────────────────── */}
            <RecentTrips
              visible={showTripHistory}
              onToggle={() => setShowTripHistory((v) => !v)}
            />

            {/* ─── Active Alerts ──────────────────────────── */}
            <ActiveAlerts />
          </>
        ) : (
          /* ─── Active Trip Dashboard ─────────────────────── */
          <ActiveTripDashboard
            bus={selectedBus}
            route={selectedRoute}
            progress={progress}
            elapsedSeconds={elapsedSeconds}
            nextStopIndex={nextStopIndex}
            currentPassengers={currentPassengers}
            eta={eta}
            onStop={handleStopTrip}
            onPassengerChange={handlePassengerChange}
          />
        )}

        {/* Bottom spacing */}
        <View style={{ height: spacing['5xl'] }} />
      </ScrollView>

      {/* ─── Bus Picker Modal ─────────────────────────────── */}
      <SelectorModal
        visible={showBusModal}
        onClose={() => setShowBusModal(false)}
        title="Seleccionar unidad"
        icon="bus"
      >
        {MOCK_BUSES.map((bus) => {
          const isSelected = bus.id === selectedBusId;
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
              onPress={() => {
                if (!isDisabled) {
                  setSelectedBusId(bus.id);
                  setShowBusModal(false);
                }
              }}
              style={({ pressed }) => [
                styles.modalOption,
                isSelected && styles.modalOptionActive,
                isDisabled && styles.modalOptionDisabled,
                pressed && !isDisabled && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: statusColor + '15' }]}>
                <Ionicons name="bus" size={20} color={isSelected ? theme.primary300 : statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalOptionTitle, isSelected && { color: theme.textPrimary }]}>
                  {bus.plate}
                </Text>
                <Text style={styles.modalOptionSubtitle}>
                  Cap. {bus.capacity} · {bus.passengers} pasajeros
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>{bus.status}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={theme.primary300} style={{ marginLeft: spacing.sm }} />
              )}
            </Pressable>
          );
        })}
      </SelectorModal>

      {/* ─── Route Picker Modal ───────────────────────────── */}
      <SelectorModal
        visible={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        title="Seleccionar recorrido"
        icon="map"
      >
        {MOCK_ROUTES.map((route) => {
          const isSelected = route.id === selectedRouteId;
          return (
            <Pressable
              key={route.id}
              onPress={() => {
                setSelectedRouteId(route.id);
                setShowRouteModal(false);
              }}
              style={({ pressed }) => [
                styles.modalOption,
                isSelected && styles.modalOptionActive,
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
                  style={[styles.modalOptionTitle, isSelected && { color: theme.textPrimary }]}
                >
                  {route.name}
                </Text>
                <Text style={styles.modalOptionSubtitle}>
                  {route.stops.length} paradas · {route.duration}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={theme.primary300} />
              )}
            </Pressable>
          );
        })}
      </SelectorModal>
    </View>
  );
}

// ── Driver Header ───────────────────────────────────────────
function DriverHeader() {
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
    <View style={styles.header}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {DRIVER_PROFILE.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </Text>
        </View>
        <Animated.View style={[styles.avatarOnline, { opacity: pulseAnim }]} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerEyebrow}>Modo Conductor</Text>
        <Text style={styles.headerName}>{DRIVER_PROFILE.name}</Text>
        <Text style={styles.headerCompany}>{DRIVER_PROFILE.company}</Text>
      </View>

      {/* Connection badge */}
      <View style={styles.connectionBadge}>
        <Animated.View style={[styles.connDot, { opacity: pulseAnim }]} />
        <Text style={styles.connText}>En línea</Text>
      </View>
    </View>
  );
}

// ── Status Hero ─────────────────────────────────────────────
function StatusHero({
  isTripActive,
  route,
  bus,
}: {
  isTripActive: boolean;
  route: DriverRoute;
  bus: DriverBus;
}) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isTripActive]);

  return (
    <Animated.View
      style={[
        styles.heroCard,
        isTripActive && styles.heroCardActive,
        { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
      ]}
    >
      <View style={styles.heroIconWrap}>
        <Ionicons
          name={isTripActive ? 'navigate' : 'bus'}
          size={28}
          color="#fff"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroTitle}>
          {isTripActive ? `Línea ${route.code} en curso` : 'Listo para operar'}
        </Text>
        <Text style={styles.heroSubtitle}>
          {isTripActive
            ? `${route.name} · ${bus.plate}`
            : `${DRIVER_PROFILE.shift}`}
        </Text>
      </View>
      <View style={[styles.heroBadge, isTripActive ? styles.heroBadgeActive : styles.heroBadgeIdle]}>
        <View style={[styles.heroBadgeDot, { backgroundColor: isTripActive ? theme.success : theme.info }]} />
        <Text style={[styles.heroBadgeText, { color: isTripActive ? theme.success : theme.info }]}>
          {isTripActive ? 'Activo' : 'Disponible'}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Setup Section ───────────────────────────────────────────
function SetupSection({
  bus,
  route,
  onBusPress,
  onRoutePress,
  onStart,
}: {
  bus: DriverBus;
  route: DriverRoute;
  onBusPress: () => void;
  onRoutePress: () => void;
  onStart: () => void;
}) {
  const statusColor =
    bus.status === 'Disponible' ? theme.success : bus.status === 'En servicio' ? theme.info : theme.warning;

  return (
    <View style={styles.setupSection}>
      <Text style={styles.sectionEyebrow}>Configurar recorrido</Text>

      {/* Bus selector card */}
      <Pressable
        onPress={onBusPress}
        style={({ pressed }) => [styles.selectorCard, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
      >
        <View style={styles.selectorCardLeft}>
          <View style={[styles.selectorIconWrap, { backgroundColor: 'rgba(90, 150, 245, 0.12)' }]}>
            <Ionicons name="bus" size={22} color={theme.primary300} />
          </View>
          <View>
            <Text style={styles.selectorLabel}>Unidad</Text>
            <Text style={styles.selectorValue}>{bus.plate}</Text>
          </View>
        </View>
        <View style={styles.selectorCardRight}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>{bus.status}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </View>
      </Pressable>

      {/* Route selector card */}
      <Pressable
        onPress={onRoutePress}
        style={({ pressed }) => [styles.selectorCard, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
      >
        <View style={styles.selectorCardLeft}>
          <View style={[styles.routeCodeBadge, styles.routeCodeBadgeActive]}>
            <Text style={[styles.routeCode, { color: '#fff' }]}>{route.code}</Text>
          </View>
          <View>
            <Text style={styles.selectorLabel}>Recorrido</Text>
            <Text style={styles.selectorValue}>{route.name}</Text>
          </View>
        </View>
        <View style={styles.selectorCardRight}>
          <Text style={styles.selectorMeta}>{route.stops.length} paradas · {route.duration}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </View>
      </Pressable>

      {/* Summary chips */}
      <View style={styles.setupChips}>
        <View style={styles.setupChip}>
          <Ionicons name="people" size={14} color={theme.primary300} />
          <Text style={styles.setupChipText}>{bus.passengers}/{bus.capacity}</Text>
        </View>
        <View style={styles.setupChip}>
          <Ionicons name="time" size={14} color={theme.primary300} />
          <Text style={styles.setupChipText}>{route.duration}</Text>
        </View>
        <View style={styles.setupChip}>
          <Ionicons name="navigate" size={14} color={theme.primary300} />
          <Text style={styles.setupChipText}>{route.stops.length} paradas</Text>
        </View>
      </View>

      {/* Start button */}
      <GradientButton
        onPress={onStart}
        disabled={bus.status === 'Mantenimiento'}
        icon="play"
        label="Iniciar recorrido"
      />
    </View>
  );
}

// ── Today's Stats ───────────────────────────────────────────
function TodayStats() {
  return (
    <View style={styles.todaySection}>
      <Text style={styles.sectionEyebrow}>Resumen del día</Text>
      <View style={styles.todayGrid}>
        <MiniStatCard
          icon="repeat"
          value={DRIVER_PROFILE.tripsToday.toString()}
          label="Recorridos"
          color={theme.primary300}
        />
        <MiniStatCard
          icon="time"
          value={`${DRIVER_PROFILE.hoursToday}h`}
          label="Horas"
          color={theme.info}
        />
        <MiniStatCard
          icon="star"
          value={DRIVER_PROFILE.rating.toString()}
          label="Puntuación"
          color={theme.warning}
        />
        <MiniStatCard
          icon="trending-up"
          value={DRIVER_PROFILE.tripsTotal.toString()}
          label="Total viajes"
          color={theme.success}
        />
      </View>
    </View>
  );
}

function MiniStatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={[styles.miniStat, { borderColor: color + '25' }]}>
      <View style={[styles.miniStatIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

// ── Recent Trips ────────────────────────────────────────────
function RecentTrips({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.recentSection}>
      <Pressable onPress={onToggle} style={styles.sectionHeaderRow}>
        <Text style={styles.sectionEyebrow}>Recorridos recientes</Text>
        <View style={styles.toggleBtn}>
          <Text style={styles.toggleBtnText}>{visible ? 'Ocultar' : 'Ver todos'}</Text>
          <Ionicons
            name={visible ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.primary300}
          />
        </View>
      </Pressable>

      {visible && (
        <View style={styles.tripsList}>
          {TRIP_HISTORY.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <View style={styles.tripCardLeft}>
                <View style={styles.tripCodeBadge}>
                  <Text style={styles.tripCodeText}>{trip.routeCode}</Text>
                </View>
                <View>
                  <Text style={styles.tripName}>{trip.routeName}</Text>
                  <Text style={styles.tripMeta}>
                    {trip.startTime} – {trip.endTime} · {trip.busPlate}
                  </Text>
                </View>
              </View>
              <View style={styles.tripCardRight}>
                <View style={styles.tripPassengers}>
                  <Ionicons name="people" size={12} color={theme.primary300} />
                  <Text style={styles.tripPassengersText}>{trip.passengers}</Text>
                </View>
                <View style={styles.tripStatusDone}>
                  <Ionicons name="checkmark" size={10} color={theme.success} />
                  <Text style={styles.tripStatusDoneText}>{trip.duration}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Active Alerts ───────────────────────────────────────────
function ActiveAlerts() {
  const severityConfig = {
    warning: { color: theme.warning, icon: 'warning-outline' as const, bg: 'rgba(234, 179, 8, 0.08)' },
    danger: { color: theme.danger, icon: 'alert-circle-outline' as const, bg: 'rgba(239, 68, 68, 0.08)' },
    info: { color: theme.info, icon: 'information-circle-outline' as const, bg: 'rgba(14, 165, 233, 0.08)' },
  };

  return (
    <View style={styles.alertsSection}>
      <Text style={styles.sectionEyebrow}>Avisos activos</Text>
      {ALERT_EVENTS.map((alert) => {
        const config = severityConfig[alert.severity];
        return (
          <View key={alert.id} style={[styles.alertCard, { backgroundColor: config.bg, borderLeftColor: config.color }]}>
            <View style={[styles.alertIconWrap, { backgroundColor: config.color + '20' }]}>
              <Ionicons name={config.icon as any} size={18} color={config.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.alertTitleRow}>
                <Text style={[styles.alertTitle, { color: config.color }]}>{alert.title}</Text>
                <Text style={styles.alertTime}>{alert.time}</Text>
              </View>
              <Text style={styles.alertDesc}>{alert.description}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Active Trip Dashboard ───────────────────────────────────
function ActiveTripDashboard({
  bus,
  route,
  progress,
  elapsedSeconds,
  nextStopIndex,
  currentPassengers,
  eta,
  onStop,
  onPassengerChange,
}: {
  bus: DriverBus;
  route: DriverRoute;
  progress: number;
  elapsedSeconds: number;
  nextStopIndex: number;
  currentPassengers: number;
  eta: number;
  onStop: () => void;
  onPassengerChange: (delta: number) => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const elapsedSec = elapsedSeconds % 60;
  const speed = 15 + Math.floor(Math.random() * 25); // Simulated speed

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <>
      {/* Live status card */}
      <View style={[styles.card, styles.cardLive]}>
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
          <GradientButton
            onPress={onStop}
            icon="stop"
            label="Finalizar"
            danger
          />
        </View>

        {/* Big stats row */}
        <View style={styles.bigStatsRow}>
          <View style={styles.bigStatItem}>
            <Text style={styles.bigStatValue}>
              {elapsedMin}:{elapsedSec.toString().padStart(2, '0')}
            </Text>
            <Text style={styles.bigStatLabel}>Tiempo</Text>
          </View>
          <View style={styles.bigStatDivider} />
          <View style={styles.bigStatItem}>
            <Text style={[styles.bigStatValue, { color: theme.info }]}>{speed}</Text>
            <Text style={styles.bigStatLabel}>km/h</Text>
          </View>
          <View style={styles.bigStatDivider} />
          <View style={styles.bigStatItem}>
            <Text style={[styles.bigStatValue, { color: theme.success }]}>{eta}</Text>
            <Text style={styles.bigStatLabel}>min ETA</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabelStart}>Progreso del recorrido</Text>
            <Text style={styles.progressPercent}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]}>
              <View style={styles.progressGlow} />
            </View>
          </View>
        </View>
      </View>

      {/* Stop-by-stop timeline */}
      <View style={styles.card}>
        <View style={styles.timelineHeader}>
          <Ionicons name="git-branch-outline" size={18} color={theme.primary300} />
          <Text style={styles.timelineSectionTitle}>Itinerario de paradas</Text>
        </View>
        {route.stops.map((stop, i) => {
          const isPassed = i < nextStopIndex;
          const isCurrent = i === nextStopIndex;
          const isLast = i === route.stops.length - 1;

          return (
            <View key={`${route.id}-${i}`} style={styles.timelineItem}>
              {/* Node */}
              <View style={styles.timelineNodeCol}>
                <View
                  style={[
                    styles.timelineNode,
                    isPassed && styles.timelineNodePassed,
                    isCurrent && styles.timelineNodeCurrent,
                  ]}
                >
                  {isPassed ? (
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  ) : isCurrent ? (
                    <Animated.View style={[styles.currentNodeDot, { opacity: pulseAnim }]} />
                  ) : (
                    <View style={styles.futureNodeDot} />
                  )}
                </View>
                {!isLast && (
                  <View
                    style={[
                      styles.timelineConnector,
                      isPassed && styles.timelineConnectorPassed,
                    ]}
                  />
                )}
              </View>

              {/* Info */}
              <View style={[styles.timelineInfo, isCurrent && styles.timelineInfoCurrent]}>
                <Text
                  style={[
                    styles.timelineStopName,
                    isPassed && styles.timelineStopPassed,
                    isCurrent && styles.timelineStopCurrent,
                  ]}
                >
                  {stop}
                </Text>
                {isCurrent && (
                  <View style={styles.currentStopBadge}>
                    <Text style={styles.currentStopText}>Próxima parada</Text>
                  </View>
                )}
                {isPassed && <Text style={styles.timelinePassedText}>Completada</Text>}
              </View>
            </View>
          );
        })}
      </View>

      {/* Passenger counter */}
      <View style={styles.card}>
        <View style={styles.passengerHeader}>
          <View style={[styles.passengerIconWrap]}>
            <Ionicons name="people" size={20} color={theme.primary300} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerTitle}>Control de pasajeros</Text>
            <Text style={styles.passengerSubtitle}>
              {currentPassengers}/{bus.capacity} — {Math.round((currentPassengers / bus.capacity) * 100)}% ocupación
            </Text>
          </View>
        </View>

        {/* Occupancy bar */}
        <View style={styles.occBar}>
          <View
            style={[
              styles.occBarFill,
              {
                width: `${Math.round((currentPassengers / bus.capacity) * 100)}%`,
                backgroundColor:
                  currentPassengers / bus.capacity < 0.5
                    ? theme.success
                    : currentPassengers / bus.capacity < 0.8
                    ? theme.warning
                    : theme.danger,
              },
            ]}
          />
        </View>

        {/* Counter buttons */}
        <View style={styles.counterRow}>
          <Pressable
            onPress={() => onPassengerChange(-1)}
            style={({ pressed }) => [styles.counterBtn, styles.counterBtnMinus, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="remove" size={24} color={theme.danger} />
            <Text style={[styles.counterBtnLabel, { color: theme.danger }]}>Bajada</Text>
          </Pressable>

          <View style={styles.counterDisplay}>
            <Text style={styles.counterValue}>{currentPassengers}</Text>
            <Text style={styles.counterLabel}>pasajeros</Text>
          </View>

          <Pressable
            onPress={() => onPassengerChange(1)}
            style={({ pressed }) => [styles.counterBtn, styles.counterBtnPlus, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={24} color={theme.success} />
            <Text style={[styles.counterBtnLabel, { color: theme.success }]}>Subida</Text>
          </Pressable>
        </View>
      </View>

      {/* Hint */}
      <View style={styles.hint}>
        <Ionicons name="location" size={14} color={theme.info} />
        <Text style={styles.hintText}>
          GPS activo — tu ubicación se transmite en tiempo real al servidor.
        </Text>
      </View>
    </>
  );
}

// ── Selector Modal ──────────────────────────────────────────
function SelectorModal({
  visible,
  onClose,
  title,
  icon,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={icon as any} size={22} color={theme.primary300} />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={28} color={theme.textMuted} />
            </Pressable>
          </View>

          {/* Options */}
          <ScrollView
            style={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {children}
            <View style={{ height: spacing['3xl'] }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgDeep },
  content: { padding: spacing.lg },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primary500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.primary300 + '40',
  },
  avatarText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: '#fff',
  },
  avatarOnline: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.success,
    borderWidth: 2,
    borderColor: theme.bgDeep,
  },
  headerEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  headerCompany: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: 1,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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

  // ── Hero ──
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  heroCardActive: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: theme.primary500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroBadgeActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  heroBadgeIdle: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  heroBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // ── Setup Section ──
  setupSection: {
    marginBottom: spacing['2xl'],
  },
  sectionEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.lg,
  },
  selectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  selectorCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectorCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: 2,
  },
  selectorValue: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  selectorMeta: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },

  setupChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  setupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(90, 150, 245, 0.08)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  setupChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textSecondary,
  },

  // ── Status pills ──
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: fontSize.xs, fontWeight: '700' },

  // ── Route code badge ──
  routeCodeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCodeBadgeActive: {
    backgroundColor: theme.primary500,
  },
  routeCode: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: theme.primary300,
  },

  // ── Gradient button ──
  gradientBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  gradientBtnOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  gradientBtnText: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Today's stats ──
  todaySection: {
    marginBottom: spacing['2xl'],
  },
  todayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  miniStat: {
    width: (SCREEN_W - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  miniStatIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  miniStatLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },

  // ── Recent trips ──
  recentSection: {
    marginBottom: spacing['2xl'],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.primary300,
  },
  tripsList: { gap: spacing.sm },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tripCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  tripCodeBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripCodeText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: theme.primary300,
  },
  tripName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  tripMeta: {
    fontSize: fontSize.xs - 1,
    color: theme.textMuted,
    marginTop: 1,
  },
  tripCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tripPassengers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripPassengersText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.primary300,
  },
  tripStatusDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tripStatusDoneText: {
    fontSize: fontSize.xs - 1,
    fontWeight: '600',
    color: theme.success,
  },

  // ── Alerts ──
  alertsSection: {
    marginBottom: spacing['2xl'],
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  alertTime: {
    fontSize: fontSize.xs - 1,
    color: theme.textMuted,
  },
  alertDesc: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    lineHeight: 16,
  },

  // ── Active trip card ──
  card: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardLive: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },

  // Live heading
  liveHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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

  // Big stats row
  bigStatsRow: {
    flexDirection: 'row',
    backgroundColor: theme.surface2,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  bigStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  bigStatValue: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  bigStatLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  bigStatDivider: {
    width: 1,
    backgroundColor: theme.border,
    marginVertical: 4,
  },

  // Progress
  progressSection: { marginBottom: spacing.sm },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressLabelStart: { fontSize: fontSize.xs, color: theme.textSecondary },
  progressPercent: { fontSize: fontSize.xs, fontWeight: '700', color: theme.primary300 },
  progressTrack: {
    height: 10,
    backgroundColor: theme.surface3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary400,
    borderRadius: radius.full,
    position: 'relative',
  },
  progressGlow: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: radius.full,
  },

  // Timeline
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  timelineSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 52,
  },
  timelineNodeCol: {
    alignItems: 'center',
    width: 28,
    marginRight: spacing.md,
  },
  timelineNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.surface3,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineNodePassed: {
    backgroundColor: theme.success,
    borderColor: theme.success,
  },
  timelineNodeCurrent: {
    backgroundColor: theme.primary500,
    borderColor: theme.primary300,
    shadowColor: theme.primary300,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  currentNodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  futureNodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.textMuted,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: theme.border,
    marginVertical: 2,
  },
  timelineConnectorPassed: {
    backgroundColor: theme.success,
  },
  timelineInfo: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: spacing.md,
  },
  timelineInfoCurrent: {
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: -2,
    marginBottom: spacing.sm,
  },
  timelineStopName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  timelineStopPassed: {
    color: theme.textMuted,
    textDecorationLine: 'line-through',
  },
  timelineStopCurrent: {
    fontWeight: '700',
    color: theme.primary300,
  },
  currentStopBadge: {
    marginTop: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  currentStopText: {
    fontSize: fontSize.xs - 1,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelinePassedText: {
    fontSize: fontSize.xs - 1,
    color: theme.textMuted,
    marginTop: 2,
  },

  // Passenger counter
  passengerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  passengerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  passengerSubtitle: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: 2,
  },
  occBar: {
    height: 6,
    backgroundColor: theme.surface3,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  occBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  counterBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  counterBtnMinus: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  counterBtnPlus: {
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  counterBtnLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  counterDisplay: {
    alignItems: 'center',
  },
  counterValue: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: theme.textPrimary,
  },
  counterLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },

  // Hint
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(14, 165, 233, 0.06)',
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  hintText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    textAlign: 'center',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.bgDeep,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '80%',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.surface3,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  modalHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  modalOptionActive: {
    borderColor: theme.primary400,
    backgroundColor: 'rgba(59, 122, 219, 0.08)',
  },
  modalOptionDisabled: {
    opacity: 0.4,
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  modalOptionSubtitle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
});
