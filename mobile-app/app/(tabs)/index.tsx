// ============================================================
// Tab 1 — Dashboard (Home)
// Premium overview: driver profile hero, live fleet stats,
// quick actions grid, active routes, and shift information
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES, MOCK_ROUTES, DRIVER_PROFILE, TRIP_HISTORY, ALERT_EVENTS } from '@/data/mockData';

const theme = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const [connectionStatus] = useState<'connected' | 'disconnected'>('connected');

  const activeBuses = MOCK_BUSES.filter((b) => b.status === 'En servicio').length;
  const availableBuses = MOCK_BUSES.filter((b) => b.status === 'Disponible').length;
  const maintenanceBuses = MOCK_BUSES.filter((b) => b.status === 'Mantenimiento').length;
  const totalPassengers = MOCK_BUSES.reduce((acc, b) => acc + b.passengers, 0);

  const greeting = getGreeting();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Connection Banner ───────────────────────────── */}
      <ConnectionBanner status={connectionStatus} />

      {/* ─── Driver Profile Hero ─────────────────────────── */}
      <View style={styles.profileHero}>
        <View style={styles.profileLeft}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {DRIVER_PROFILE.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </Text>
            </View>
            <View style={styles.avatarRing} />
          </View>
          <View>
            <Text style={styles.greetingLabel}>{greeting}</Text>
            <Text style={styles.greetingTitle}>{DRIVER_PROFILE.name}</Text>
            <Text style={styles.greetingCompany}>{DRIVER_PROFILE.company}</Text>
          </View>
        </View>
        <View style={styles.profileRight}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={14} color={theme.warning} />
            <Text style={styles.ratingText}>{DRIVER_PROFILE.rating}</Text>
          </View>
        </View>
      </View>

      {/* ─── Shift Info Card ─────────────────────────────── */}
      <View style={styles.shiftCard}>
        <View style={styles.shiftIconWrap}>
          <Ionicons name="calendar-outline" size={20} color={theme.primary300} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.shiftTitle}>{DRIVER_PROFILE.shift}</Text>
          <Text style={styles.shiftSubtitle}>
            {DRIVER_PROFILE.tripsToday} recorridos completados hoy · {DRIVER_PROFILE.hoursToday}h trabajadas
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </View>

      {/* ─── Stat Cards ──────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Estado de la flota</Text>
      <View style={styles.statGrid}>
        <AnimatedStatCard
          icon="bus"
          label="En servicio"
          value={activeBuses.toString()}
          color={theme.success}
          bgColor="rgba(34, 197, 94, 0.10)"
          delay={0}
        />
        <AnimatedStatCard
          icon="checkmark-circle"
          label="Disponibles"
          value={availableBuses.toString()}
          color={theme.info}
          bgColor="rgba(14, 165, 233, 0.10)"
          delay={100}
        />
        <AnimatedStatCard
          icon="construct"
          label="Mantenimiento"
          value={maintenanceBuses.toString()}
          color={theme.warning}
          bgColor="rgba(234, 179, 8, 0.10)"
          delay={200}
        />
        <AnimatedStatCard
          icon="people"
          label="Pasajeros"
          value={totalPassengers.toString()}
          color={theme.primary300}
          bgColor="rgba(90, 150, 245, 0.10)"
          delay={300}
        />
      </View>

      {/* ─── Quick Actions ───────────────────────────────── */}
      <Text style={styles.sectionTitle}>Acciones rápidas</Text>
      <View style={styles.quickActions}>
        <QuickAction
          icon="play-circle"
          label="Iniciar recorrido"
          color={theme.success}
          onPress={() => router.push('/driver')}
        />
        <QuickAction
          icon="location"
          label="Ver flota"
          color={theme.info}
          onPress={() => router.push('/buses')}
        />
        <QuickAction
          icon="alert-circle"
          label="Modo Conductor"
          color={theme.warning}
          onPress={() => router.push('/driver')}
        />
        <QuickAction
          icon="stats-chart"
          label="Rutas"
          color={theme.primary300}
          onPress={() => router.push('/routes')}
        />
      </View>

      {/* ─── Recent Activity ─────────────────────────────── */}
      <Text style={styles.sectionTitle}>Actividad reciente</Text>
      {TRIP_HISTORY.slice(0, 3).map((trip, index) => (
        <View key={trip.id} style={styles.activityCard}>
          <View style={styles.activityLeft}>
            <View style={styles.activityTimeline}>
              <View style={[styles.activityDot, { backgroundColor: theme.success }]} />
              {index < 2 && <View style={styles.activityLine} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.activityRow}>
                <Text style={styles.activityTitle}>
                  Línea {trip.routeCode} — {trip.routeName}
                </Text>
                <Text style={styles.activityTime}>{trip.startTime}</Text>
              </View>
              <Text style={styles.activityMeta}>
                {trip.busPlate} · {trip.duration} · {trip.passengers} pasajeros
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* ─── Active Alerts Preview ────────────────────────── */}
      {ALERT_EVENTS.length > 0 && (
        <>
          <View style={styles.alertsHeaderRow}>
            <Text style={styles.sectionTitle}>Avisos</Text>
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{ALERT_EVENTS.length}</Text>
            </View>
          </View>
          {ALERT_EVENTS.slice(0, 2).map((alert) => {
            const isWarning = alert.severity === 'warning' || alert.severity === 'danger';
            return (
              <View
                key={alert.id}
                style={[
                  styles.alertPreview,
                  {
                    backgroundColor: isWarning ? 'rgba(234, 179, 8, 0.06)' : 'rgba(14, 165, 233, 0.06)',
                    borderLeftColor: isWarning ? theme.warning : theme.info,
                  },
                ]}
              >
                <Ionicons
                  name={isWarning ? 'warning-outline' : 'information-circle-outline'}
                  size={16}
                  color={isWarning ? theme.warning : theme.info}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertPreviewTitle, { color: isWarning ? theme.warning : theme.info }]}>
                    {alert.title}
                  </Text>
                  <Text style={styles.alertPreviewDesc} numberOfLines={1}>
                    {alert.description}
                  </Text>
                </View>
                <Text style={styles.alertPreviewTime}>{alert.time}</Text>
              </View>
            );
          })}
        </>
      )}

      {/* ─── Active Routes Summary ────────────────────────── */}
      <Text style={[styles.sectionTitle, { marginTop: spacing['2xl'] }]}>Rutas activas</Text>
      {MOCK_ROUTES.map((route) => (
        <Pressable
          key={route.id}
          style={({ pressed }) => [
            styles.routeCard,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}
          onPress={() => router.push('/routes')}
        >
          <View style={styles.routeCodeBadge}>
            <Text style={styles.routeCodeText}>{route.code}</Text>
          </View>
          <View style={styles.routeInfo}>
            <Text style={styles.routeName}>{route.name}</Text>
            <Text style={styles.routeMeta}>
              {route.stops.length} paradas · {route.duration}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
      ))}

      {/* Bottom spacing */}
      <View style={{ height: spacing['4xl'] }} />
    </ScrollView>
  );
}

// ── Helpers ─────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

// ── Connection Banner ───────────────────────────────────────
function ConnectionBanner({ status }: { status: 'connected' | 'disconnected' }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [status, pulseAnim]);

  return (
    <View style={styles.connectionBanner}>
      <Animated.View
        style={[
          styles.statusDot,
          status === 'connected' && styles.statusDotActive,
          { opacity: status === 'connected' ? pulseAnim : 1 },
        ]}
      />
      <Text style={[styles.connectionText, status !== 'connected' && { color: theme.danger }]}>
        {status === 'connected' ? 'Conectado al servidor' : 'Sin conexión'}
      </Text>
      <Ionicons
        name={status === 'connected' ? 'wifi' : 'wifi-outline'}
        size={14}
        color={status === 'connected' ? theme.success : theme.danger}
      />
    </View>
  );
}

// ── Animated Stat Card ──────────────────────────────────────
function AnimatedStatCard({
  icon,
  label,
  value,
  color,
  bgColor,
  delay = 0,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.statCard,
        { borderColor: color + '25', opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.statIconWrap, { backgroundColor: bgColor }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ── Quick Action ────────────────────────────────────────────
function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickActionCard,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bgDeep,
  },
  content: {
    padding: spacing.lg,
  },

  // Connection banner
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.textMuted,
  },
  statusDotActive: {
    backgroundColor: theme.success,
    shadowColor: theme.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  connectionText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Profile Hero
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  avatarRing: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.success,
    borderWidth: 3,
    borderColor: theme.bgDeep,
  },
  greetingLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 2,
  },
  greetingTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  greetingCompany: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  profileRight: {},
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: theme.warning,
  },

  // Shift card
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  shiftIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  shiftSubtitle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    lineHeight: 16,
  },

  // Section title
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: spacing.lg,
  },

  // Stats grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  statCard: {
    width: (SCREEN_W - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: '500',
  },

  // Quick actions (2x2 grid)
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  quickActionCard: {
    width: (SCREEN_W - spacing.lg * 2 - spacing.sm) / 2,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Activity cards
  activityCard: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  activityLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: spacing.md,
  },
  activityTimeline: {
    alignItems: 'center',
    width: 16,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2,
  },
  activityLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.border,
    marginVertical: 2,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  activityTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  activityTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  activityMeta: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: spacing.lg,
  },

  // Alerts header
  alertsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  alertCountBadge: {
    backgroundColor: theme.danger,
    borderRadius: radius.full,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  alertCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  // Alert preview
  alertPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertPreviewTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  alertPreviewDesc: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  alertPreviewTime: {
    fontSize: fontSize.xs - 1,
    color: theme.textMuted,
  },

  // Route cards
  routeCard: {
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
  routeCodeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: theme.primary500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCodeText: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: '#fff',
  },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  routeMeta: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
});
