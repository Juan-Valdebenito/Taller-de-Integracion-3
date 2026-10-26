// ============================================================
// Tab 3 — Micros (Fleet list)
// Premium fleet overview: animated summary chips, rich bus cards
// with gradient occupancy bars, status indicators, and detail
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
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES } from '@/data/mockData';

const theme = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ─────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status) {
    case 'Disponible':
      return theme.success;
    case 'En servicio':
      return theme.info;
    case 'Mantenimiento':
      return theme.warning;
    default:
      return theme.textMuted;
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'Disponible':
      return 'checkmark-circle';
    case 'En servicio':
      return 'navigate';
    case 'Mantenimiento':
      return 'construct';
    default:
      return 'help-circle';
  }
}

function occupancyPercent(passengers: number, capacity: number) {
  return Math.round((passengers / capacity) * 100);
}

function occupancyColor(pct: number) {
  if (pct <= 40) return theme.occupancyLow;
  if (pct <= 70) return theme.occupancyMedium;
  if (pct <= 90) return theme.occupancyHigh;
  return theme.occupancyFull;
}

function occupancyLabel(pct: number) {
  if (pct <= 40) return 'Baja';
  if (pct <= 70) return 'Media';
  if (pct <= 90) return 'Alta';
  return 'Lleno';
}

// ── Main Screen ─────────────────────────────────────────────
export default function BusesScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Disponible' | 'En servicio' | 'Mantenimiento'>('all');

  const totalBuses = MOCK_BUSES.length;
  const active = MOCK_BUSES.filter((b) => b.status === 'En servicio').length;
  const available = MOCK_BUSES.filter((b) => b.status === 'Disponible').length;
  const maintenance = MOCK_BUSES.filter((b) => b.status === 'Mantenimiento').length;
  const totalPassengers = MOCK_BUSES.reduce((sum, b) => sum + b.passengers, 0);
  const totalCapacity = MOCK_BUSES.reduce((sum, b) => sum + b.capacity, 0);
  const overallOccupancy = Math.round((totalPassengers / totalCapacity) * 100);

  const filteredBuses = MOCK_BUSES.filter((bus) => {
    const matchesSearch = bus.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bus.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || bus.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Search Bar ──────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por patente o ID..."
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>

      {/* ─── Summary Strip ───────────────────────────────── */}
      <View style={styles.summaryStrip}>
        <SummaryChip icon="bus" label="Total" value={totalBuses} color={theme.primary300} />
        <SummaryChip icon="navigate" label="Activas" value={active} color={theme.success} />
        <SummaryChip icon="checkmark-circle" label="Libres" value={available} color={theme.info} />
      </View>

      {/* ─── Overall Occupancy ────────────────────────────── */}
      <View style={styles.overallCard}>
        <View style={styles.overallHeader}>
          <View style={styles.overallIconWrap}>
            <Ionicons name="analytics" size={20} color={theme.primary300} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overallTitle}>Ocupación general de la flota</Text>
            <Text style={styles.overallSubtitle}>
              {totalPassengers} de {totalCapacity} asientos ocupados
            </Text>
          </View>
          <Text style={[styles.overallPercent, { color: occupancyColor(overallOccupancy) }]}>
            {overallOccupancy}%
          </Text>
        </View>
        <View style={styles.overallTrack}>
          <View
            style={[
              styles.overallFill,
              { width: `${overallOccupancy}%`, backgroundColor: occupancyColor(overallOccupancy) },
            ]}
          />
        </View>
      </View>

      {/* ─── Filter Chips ────────────────────────────────── */}
      <View style={styles.filterRow}>
        {(['all', 'Disponible', 'En servicio', 'Mantenimiento'] as const).map((status) => {
          const isActive = filterStatus === status;
          const chipLabel = status === 'all' ? `Todas (${totalBuses})` : status;
          return (
            <Pressable
              key={status}
              onPress={() => setFilterStatus(status)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {chipLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ─── Bus Cards ───────────────────────────────────── */}
      {filteredBuses.map((bus, index) => (
        <AnimatedBusCard key={bus.id} bus={bus} index={index} />
      ))}

      {filteredBuses.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="bus-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptySubtitle}>No se encontraron unidades con ese filtro.</Text>
        </View>
      )}

      <View style={{ height: spacing['4xl'] }} />
    </ScrollView>
  );
}

// ── Animated Bus Card ───────────────────────────────────────
function AnimatedBusCard({ bus, index }: { bus: typeof MOCK_BUSES[0]; index: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [expanded, setExpanded] = useState(false);

  const pct = occupancyPercent(bus.passengers, bus.capacity);
  const occColor = occupancyColor(pct);
  const stColor = statusColor(bus.status);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [
          styles.busCard,
          pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
        ]}
      >
        {/* Top row: plate + status */}
        <View style={styles.busTopRow}>
          <View style={styles.busIconWrap}>
            <Ionicons name="bus" size={22} color={theme.primary300} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.busPlate}>{bus.plate}</Text>
            <Text style={styles.busId}>{bus.id}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: stColor + '15' }]}>
            <Ionicons name={statusIcon(bus.status) as any} size={12} color={stColor} />
            <Text style={[styles.statusPillText, { color: stColor }]}>{bus.status}</Text>
          </View>
        </View>

        {/* Occupancy bar */}
        <View style={styles.occSection}>
          <View style={styles.occLabelRow}>
            <Text style={styles.occLabel}>Ocupación</Text>
            <View style={styles.occBadgeRow}>
              <View style={[styles.occLevelBadge, { backgroundColor: occColor + '18' }]}>
                <Text style={[styles.occLevelText, { color: occColor }]}>{occupancyLabel(pct)}</Text>
              </View>
              <Text style={[styles.occPct, { color: occColor }]}>{pct}%</Text>
            </View>
          </View>
          <View style={styles.occTrack}>
            <View style={[styles.occFill, { width: `${pct}%`, backgroundColor: occColor }]} />
          </View>
          <Text style={styles.occMeta}>
            {bus.passengers} / {bus.capacity} pasajeros
          </Text>
        </View>

        {/* Bottom stats */}
        <View style={styles.busStats}>
          <View style={styles.busStat}>
            <Ionicons name="people-outline" size={14} color={theme.textMuted} />
            <Text style={styles.busStatText}>Cap. {bus.capacity}</Text>
          </View>
          <View style={styles.busStat}>
            <Ionicons name="arrow-up-outline" size={14} color={theme.success} />
            <Text style={styles.busStatText}>Subidas: {bus.passengers}</Text>
          </View>
          <View style={styles.busStat}>
            <View style={[styles.gpsDot, { backgroundColor: bus.status !== 'Mantenimiento' ? theme.success : theme.textMuted }]} />
            <Text style={styles.busStatText}>GPS {bus.status !== 'Mantenimiento' ? 'activo' : 'off'}</Text>
          </View>
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedRow}>
              <Ionicons name="speedometer-outline" size={14} color={theme.textMuted} />
              <Text style={styles.expandedText}>Velocidad: {bus.status === 'En servicio' ? '32 km/h' : '0 km/h'}</Text>
            </View>
            <View style={styles.expandedRow}>
              <Ionicons name="location-outline" size={14} color={theme.textMuted} />
              <Text style={styles.expandedText}>
                Ubicación: {bus.status === 'En servicio' ? 'Av. Alemania #2450' : 'Terminal base'}
              </Text>
            </View>
            <View style={styles.expandedRow}>
              <Ionicons name="time-outline" size={14} color={theme.textMuted} />
              <Text style={styles.expandedText}>
                Último reporte: {bus.status !== 'Mantenimiento' ? 'hace 8 seg' : 'N/A'}
              </Text>
            </View>
          </View>
        )}

        {/* Expand hint */}
        <View style={styles.expandHint}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textMuted}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Summary Chip ────────────────────────────────────────────
function SummaryChip({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.chip, { borderColor: color + '25' }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgDeep },
  content: { padding: spacing.lg },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },

  // Summary
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
  },
  chipValue: { fontSize: fontSize.xl, fontWeight: '800' },
  chipLabel: { fontSize: fontSize.xs, color: theme.textMuted },

  // Overall occupancy
  overallCard: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  overallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  overallIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overallTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  overallSubtitle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  overallPercent: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  overallTrack: {
    height: 8,
    backgroundColor: theme.surface3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  overallFill: {
    height: '100%',
    borderRadius: radius.full,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.primary500,
    borderColor: theme.primary500,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Bus card
  busCard: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  busTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  busIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busPlate: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  busId: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Occupancy
  occSection: { marginBottom: spacing.lg },
  occLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  occLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
  occBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  occLevelBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  occLevelText: {
    fontSize: fontSize.xs - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  occPct: { fontSize: fontSize.xs, fontWeight: '700' },
  occTrack: {
    height: 6,
    backgroundColor: theme.surface3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  occFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  occMeta: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },

  // Bottom stats
  busStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  busStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  busStatText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Expanded section
  expandedSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    gap: spacing.sm,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  expandedText: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  expandHint: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
  },
});
