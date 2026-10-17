// ============================================================
// Tab 4 — Rutas (Route Status & Itineraries)
// Shows operational state of lines, stops timeline, and alerts
// ============================================================
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { MOCK_ROUTES } from '@/data/mockData';

const theme = Colors.dark;

type RouteStatusType = 'normal' | 'delay' | 'detour';

interface RouteDetail {
  id: string;
  code: string;
  name: string;
  stops: string[];
  duration: string;
  frequency: string;
  activeBusesCount: number;
  status: RouteStatusType;
  statusText: string;
  alert?: string;
  onTimeRate: number;
}

const EXTENDED_ROUTES: RouteDetail[] = [
  {
    ...MOCK_ROUTES[0],
    frequency: 'Cada 8 - 12 min',
    activeBusesCount: 4,
    status: 'normal',
    statusText: 'Operación normal',
    onTimeRate: 96,
  },
  {
    ...MOCK_ROUTES[1],
    frequency: 'Cada 10 - 15 min',
    activeBusesCount: 3,
    status: 'delay',
    statusText: 'Demora leve (+6 min)',
    alert: 'Tráfico alto en Av. Caupolicán con Manuel Montt.',
    onTimeRate: 88,
  },
  {
    ...MOCK_ROUTES[2],
    frequency: 'Cada 12 - 18 min',
    activeBusesCount: 2,
    status: 'detour',
    statusText: 'Desvío programado',
    alert: 'Desvío en calle Balmaceda por mantención vial municipal.',
    onTimeRate: 91,
  },
];

export default function RoutesScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'normal' | 'alerts'>('all');
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(EXTENDED_ROUTES[0].id);

  const filteredRoutes = EXTENDED_ROUTES.filter((route) => {
    const matchesSearch =
      route.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterStatus === 'normal') return route.status === 'normal';
    if (filterStatus === 'alerts') return route.status !== 'normal';
    return true;
  });

  const totalActiveBuses = EXTENDED_ROUTES.reduce((sum, r) => sum + r.activeBusesCount, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Search Header */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar línea o destino..."
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

      {/* Quick summary stats */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{EXTENDED_ROUTES.length}</Text>
          <Text style={styles.summaryLabel}>Rutas activas</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalActiveBuses}</Text>
          <Text style={styles.summaryLabel}>Micros en servicio</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: theme.success }]}>93%</Text>
          <Text style={styles.summaryLabel}>Puntualidad</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersRow}>
        <Pressable
          style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
          onPress={() => setFilterStatus('all')}
        >
          <Text style={[styles.filterChipText, filterStatus === 'all' && styles.filterChipTextActive]}>
            Todas ({EXTENDED_ROUTES.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filterStatus === 'normal' && styles.filterChipActive]}
          onPress={() => setFilterStatus('normal')}
        >
          <Text style={[styles.filterChipText, filterStatus === 'normal' && styles.filterChipTextActive]}>
            Operación normal
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filterStatus === 'alerts' && styles.filterChipActive]}
          onPress={() => setFilterStatus('alerts')}
        >
          <Text style={[styles.filterChipText, filterStatus === 'alerts' && styles.filterChipTextActive]}>
            Con avisos (2)
          </Text>
        </Pressable>
      </View>

      {/* Route Cards */}
      <View style={styles.routesList}>
        {filteredRoutes.map((route) => {
          const isExpanded = expandedRouteId === route.id;
          const statusColors = getStatusBadgeColor(route.status);

          return (
            <View key={route.id} style={styles.routeCard}>
              {/* Card Header (pressable to toggle timeline) */}
              <Pressable
                style={styles.cardHeader}
                onPress={() => setExpandedRouteId(isExpanded ? null : route.id)}
              >
                <View style={styles.routeBadge}>
                  <Text style={styles.routeBadgeText}>{route.code}</Text>
                </View>

                <View style={styles.headerInfo}>
                  <Text style={styles.routeName}>{route.name}</Text>
                  <View style={styles.metaRow}>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: statusColors.bg, borderColor: statusColors.border },
                      ]}
                    >
                      <View style={[styles.statusDot, { backgroundColor: statusColors.dot }]} />
                      <Text style={[styles.statusPillText, { color: statusColors.text }]}>
                        {route.statusText}
                      </Text>
                    </View>
                  </View>
                </View>

                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textMuted}
                />
              </Pressable>

              {/* Alert notice if present */}
              {route.alert && (
                <View style={styles.alertBanner}>
                  <Ionicons name="warning-outline" size={16} color={theme.warning} />
                  <Text style={styles.alertText}>{route.alert}</Text>
                </View>
              )}

              {/* Quick specs row */}
              <View style={styles.specsRow}>
                <View style={styles.specItem}>
                  <Ionicons name="time-outline" size={14} color={theme.textMuted} />
                  <Text style={styles.specText}>{route.duration}</Text>
                </View>
                <View style={styles.specItem}>
                  <Ionicons name="repeat-outline" size={14} color={theme.textMuted} />
                  <Text style={styles.specText}>{route.frequency}</Text>
                </View>
                <View style={styles.specItem}>
                  <Ionicons name="bus-outline" size={14} color={theme.textMuted} />
                  <Text style={styles.specText}>{route.activeBusesCount} en ruta</Text>
                </View>
              </View>

              {/* Expanded stop timeline */}
              {isExpanded && (
                <View style={styles.expandedContent}>
                  <Text style={styles.timelineTitle}>Itinerario de paradas</Text>

                  <View style={styles.timelineList}>
                    {route.stops.map((stop, index) => {
                      const isFirst = index === 0;
                      const isLast = index === route.stops.length - 1;
                      const approxMins = Math.round(
                        (parseInt(route.duration, 10) / (route.stops.length - 1)) * index
                      );

                      return (
                        <View key={`${route.id}-stop-${index}`} style={styles.timelineItem}>
                          {/* Left node + line */}
                          <View style={styles.nodeColumn}>
                            <View
                              style={[
                                styles.nodeCircle,
                                isFirst && styles.nodeCircleStart,
                                isLast && styles.nodeCircleEnd,
                              ]}
                            >
                              <Ionicons
                                name={
                                  isFirst
                                    ? 'flag'
                                    : isLast
                                    ? 'checkmark'
                                    : 'radio-button-on'
                                }
                                size={isFirst || isLast ? 11 : 8}
                                color={
                                  isFirst || isLast
                                    ? '#FFFFFF'
                                    : theme.primary300
                                }
                              />
                            </View>
                            {!isLast && <View style={styles.nodeConnector} />}
                          </View>

                          {/* Stop info */}
                          <View style={styles.stopInfo}>
                            <Text
                              style={[
                                styles.stopName,
                                (isFirst || isLast) && styles.stopNameTerminal,
                              ]}
                            >
                              {stop}
                            </Text>
                            <Text style={styles.stopOffset}>
                              {index === 0 ? 'Terminal de salida' : `+${approxMins} min`}
                            </Text>
                          </View>

                          {/* Indicator for live bus nearby */}
                          {index === 1 && (
                            <View style={styles.liveBusIndicator}>
                              <Ionicons name="bus" size={12} color={theme.primary300} />
                              <Text style={styles.liveBusText}>En curso</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Action buttons inside expanded card */}
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.actionButtonPrimary}
                      onPress={() => router.push('/driver')}
                    >
                      <Ionicons name="navigate" size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonPrimaryText}>
                        Iniciar en Modo Conductor
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Helpers ─────────────────────────────────────────────────
function getStatusBadgeColor(status: RouteStatusType) {
  switch (status) {
    case 'normal':
      return {
        bg: 'rgba(34, 197, 94, 0.12)',
        border: 'rgba(34, 197, 94, 0.3)',
        dot: theme.success,
        text: theme.success,
      };
    case 'delay':
      return {
        bg: 'rgba(234, 179, 8, 0.12)',
        border: 'rgba(234, 179, 8, 0.3)',
        dot: theme.warning,
        text: theme.warning,
      };
    case 'detour':
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        border: 'rgba(239, 68, 68, 0.3)',
        dot: theme.danger,
        text: theme.danger,
      };
  }
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

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    height: 48,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontWeight: '500',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: theme.border,
  },

  // Filter chips
  filtersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
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
    backgroundColor: theme.primary400,
    borderColor: theme.primary400,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Route cards
  routesList: {
    gap: spacing.md,
  },
  routeCard: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  routeBadge: {
    backgroundColor: theme.primary500,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadgeText: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: fontSize.xs - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Alert
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: theme.warning,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  alertText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: theme.warning,
    lineHeight: 16,
  },

  // Specs
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  specText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontWeight: '500',
  },

  // Timeline
  expandedContent: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  timelineTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  timelineList: {
    paddingLeft: spacing.xs,
    marginBottom: spacing.lg,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 44,
  },
  nodeColumn: {
    alignItems: 'center',
    width: 22,
    marginRight: spacing.sm,
  },
  nodeCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.surface2,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  nodeCircleStart: {
    backgroundColor: theme.primary500,
    borderColor: theme.primary400,
  },
  nodeCircleEnd: {
    backgroundColor: theme.success,
    borderColor: theme.success,
  },
  nodeConnector: {
    width: 2,
    flex: 1,
    backgroundColor: theme.border,
    marginVertical: 2,
  },
  stopInfo: {
    flex: 1,
    paddingTop: 1,
  },
  stopName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  stopNameTerminal: {
    fontWeight: '700',
    color: theme.primary300,
  },
  stopOffset: {
    fontSize: fontSize.xs - 1,
    color: theme.textMuted,
    marginTop: 2,
  },
  liveBusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    gap: 4,
  },
  liveBusText: {
    fontSize: fontSize.xs - 2,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
  },

  // Actions inside card
  cardActions: {
    marginTop: spacing.xs,
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary500,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  actionButtonPrimaryText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
