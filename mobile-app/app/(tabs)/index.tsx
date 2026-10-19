// ============================================================
// Tab 1 — Dashboard (Home)
// Overview of the company fleet status at a glance
// ============================================================
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES, MOCK_ROUTES } from '@/data/mockData';

const theme = Colors.dark;
const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const [connectionStatus] = useState<'connected' | 'disconnected'>('connected');

  const activeBuses = MOCK_BUSES.filter((b) => b.status === 'En servicio').length;
  const availableBuses = MOCK_BUSES.filter((b) => b.status === 'Disponible').length;
  const maintenanceBuses = MOCK_BUSES.filter((b) => b.status === 'Mantenimiento').length;
  const totalPassengers = MOCK_BUSES.reduce((acc, b) => acc + b.passengers, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Connection status banner */}
      <View style={styles.connectionBanner}>
        <View style={[styles.statusDot, connectionStatus === 'connected' && styles.statusDotActive]} />
        <Text style={styles.connectionText}>
          {connectionStatus === 'connected' ? 'Conectado al servidor' : 'Sin conexión'}
        </Text>
        <Ionicons name="wifi" size={14} color={theme.success} />
      </View>

      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingLabel}>Bienvenido, conductor</Text>
        <Text style={styles.greetingTitle}>Panel de control</Text>
        <Text style={styles.greetingSubtitle}>
          Resumen de la flota y operaciones del día
        </Text>
      </View>

      {/* Stat Cards */}
      <View style={styles.statGrid}>
        <StatCard
          icon="bus"
          label="En servicio"
          value={activeBuses.toString()}
          color={theme.success}
          bgColor="rgba(34, 197, 94, 0.12)"
        />
        <StatCard
          icon="checkmark-circle"
          label="Disponibles"
          value={availableBuses.toString()}
          color={theme.info}
          bgColor="rgba(14, 165, 233, 0.12)"
        />
        <StatCard
          icon="construct"
          label="Mantenimiento"
          value={maintenanceBuses.toString()}
          color={theme.warning}
          bgColor="rgba(234, 179, 8, 0.12)"
        />
        <StatCard
          icon="people"
          label="Pasajeros"
          value={totalPassengers.toString()}
          color={theme.primary300}
          bgColor="rgba(90, 150, 245, 0.12)"
        />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Acciones rápidas</Text>
      <View style={styles.quickActions}>
        <QuickAction
          icon="play-circle"
          label="Iniciar recorrido"
          color={theme.success}
        />
        <QuickAction
          icon="location"
          label="Ver mi ubicación"
          color={theme.info}
        />
        <QuickAction
          icon="alert-circle"
          label="Reportar incidencia"
          color={theme.warning}
        />
      </View>

      {/* Active routes summary */}
      <Text style={styles.sectionTitle}>Rutas activas</Text>
      {MOCK_ROUTES.map((route) => (
        <View key={route.id} style={styles.routeCard}>
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
        </View>
      ))}
    </ScrollView>
  );
}

// ── Stat Card sub-component ─────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: color + '30' }]}>
      <View style={[styles.statIconWrap, { backgroundColor: bgColor }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Quick Action sub-component ──────────────────────────────
function QuickAction({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickActionCard,
        pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + '18' }]}>
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
    paddingBottom: spacing['4xl'],
  },

  // Connection banner
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
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

  // Greeting
  greeting: {
    marginBottom: spacing['2xl'],
  },
  greetingLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  greetingTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  greetingSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 20,
  },

  // Stats grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing['3xl'],
  },
  statCard: {
    width: (width - spacing.lg * 2 - spacing.md) / 2,
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

  // Section title
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: spacing.lg,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['3xl'],
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
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
    marginBottom: spacing.md,
  },
  routeCodeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCodeText: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: theme.primary300,
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
