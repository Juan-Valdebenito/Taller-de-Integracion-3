// ============================================================
// Tab 3 — Micros (Fleet list)
// Shows all company buses with status, capacity, and occupancy
// ============================================================
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_BUSES } from '@/data/mockData';

const theme = Colors.dark;

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

// ── Main Screen ─────────────────────────────────────────────
export default function BusesScreen() {
  const totalBuses = MOCK_BUSES.length;
  const active = MOCK_BUSES.filter((b) => b.status === 'En servicio').length;
  const available = MOCK_BUSES.filter((b) => b.status === 'Disponible').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <SummaryChip icon="bus" label="Total" value={totalBuses} color={theme.primary300} />
        <SummaryChip icon="navigate" label="Activas" value={active} color={theme.success} />
        <SummaryChip icon="checkmark-circle" label="Libres" value={available} color={theme.info} />
      </View>

      {/* Bus cards */}
      {MOCK_BUSES.map((bus) => {
        const pct = occupancyPercent(bus.passengers, bus.capacity);
        const occColor = occupancyColor(pct);
        const stColor = statusColor(bus.status);

        return (
          <Pressable
            key={bus.id}
            style={({ pressed }) => [
              styles.busCard,
              pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
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
              <View style={[styles.statusPill, { backgroundColor: stColor + '18' }]}>
                <Ionicons name={statusIcon(bus.status) as any} size={12} color={stColor} />
                <Text style={[styles.statusPillText, { color: stColor }]}>{bus.status}</Text>
              </View>
            </View>

            {/* Occupancy bar */}
            <View style={styles.occSection}>
              <View style={styles.occLabelRow}>
                <Text style={styles.occLabel}>Ocupación</Text>
                <Text style={[styles.occPct, { color: occColor }]}>{pct}%</Text>
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
                <Ionicons name="location-outline" size={14} color={theme.info} />
                <Text style={styles.busStatText}>GPS activo</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
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
    <View style={[styles.chip, { borderColor: color + '30' }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgDeep },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'] },

  // Summary
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
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
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(90, 150, 245, 0.12)',
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
    marginBottom: spacing.xs,
  },
  occLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
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
});
