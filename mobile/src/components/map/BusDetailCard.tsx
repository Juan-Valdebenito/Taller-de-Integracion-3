import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useEta } from '../../hooks/useEta';
import type { LiveBus } from '../../realtime/liveBuses';
import type { OccupancyInfo } from '../../realtime/types';
import { BUS_STATUS, makeStyles, radius, spacing } from '../../theme';
import { busColor } from './busIcon';
import { formatClock } from './MapStatusBar';

/** Porcentaje de ocupación redondeado, como el web. */
export const occupancyPercent = (bus: Pick<LiveBus, 'currentPassengers' | 'capacity'>) =>
  bus.capacity > 0 ? Math.round((bus.currentPassengers / bus.capacity) * 100) : 0;

/** Color de "hace Ns" según la antigüedad del dato: verde < 5 s, amarillo < 15 s, rojo después. */
export function freshnessColor(ageSec: number): string {
  if (ageSec < 5) return '#22c55e';
  if (ageSec < 15) return '#f59e0b';
  return '#ef4444';
}

/** Colores de la predicción por nivel, los del web. */
export const PREDICTION_COLORS: Readonly<Record<OccupancyInfo['occupancyLevel'], { bg: string; border: string; text: string }>> = {
  LOW: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', text: '#4ade80' },
  MEDIUM: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
  HIGH: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
  FULL: { bg: 'rgba(127,29,29,0.1)', border: 'rgba(127,29,29,0.2)', text: '#fca5a5' },
};

export interface BusDetailCardProps {
  bus: LiveBus;
  /** true si los datos vienen del tiempo real; si no, la micro es de la simulación. */
  live: boolean;
  onClose: () => void;
}

/**
 * Ficha de la micro elegida, con el contenido de la ventanita del web
 * (BusMarker): línea, frescura del dato, estado, ocupación, subidas y
 * bajadas, predicción, próxima parada con su ETA, velocidad, dirección y
 * hora de actualización. En el
 * teléfono va fija sobre el mapa en vez de seguir a la micro.
 */
export function BusDetailCard({ bus, live, onClose }: BusDetailCardProps) {
  const styles = useStyles();
  const color = busColor(bus);
  const pct = occupancyPercent(bus);
  const status = BUS_STATUS[bus.status];
  const { nextStop, isStopped } = useEta(bus);

  return (
    <View style={styles.card} accessibilityLabel={`Micro ${bus.id}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.busEmoji}>🚌</Text>
            <View style={styles.headerText}>
              <Text style={styles.busId}>{bus.id}</Text>
              <Text style={styles.routeName} numberOfLines={2}>{bus.routeName}</Text>
            </View>
          </View>
          <Freshness live={live} lastUpdate={bus.lastUpdate} />
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar detalle de la micro" hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={18} color="#94a3b8" />
          </Pressable>
        </View>

        <Text style={[styles.statusBadge, { color: status.color, backgroundColor: `${status.color}22`, borderColor: `${status.color}44` }]}>
          {status.label}
        </Text>

        <View style={styles.section}>
          <View style={styles.occupancyRow}>
            <Text style={styles.occupancyLabel}>Ocupación actual</Text>
            <Text style={[styles.occupancyPct, { color }]}>{pct}%</Text>
          </View>
          <View style={styles.track} accessibilityLabel={`Ocupación ${pct}%`}>
            <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.passengers}>
            {bus.currentPassengers} / {bus.capacity} pasajeros
          </Text>
        </View>

        <View style={styles.grid}>
          <Stat label="Subidas" value={String(bus.totalBoardings)} valueColor="#4ade80" background="rgba(34,197,94,0.08)" />
          <Stat label="Bajadas" value={String(bus.totalAlightings)} valueColor="#fbbf24" background="rgba(245,158,11,0.08)" />
        </View>

        {bus.occupancy ? <Prediction occupancy={bus.occupancy} /> : null}

        {!isStopped && nextStop ? (
          <View style={styles.eta} accessible accessibilityLabel={`Próxima parada: ${nextStop.stopName}, en ${nextStop.etaLabel}, a unos ${Math.round(nextStop.distanceM)} metros`}>
            <Text style={styles.etaTitle}>⏱ Próxima parada</Text>
            <View style={styles.etaRow}>
              <Text style={styles.etaStop} numberOfLines={1}>{nextStop.stopName}</Text>
              <Text style={styles.etaTime}>{nextStop.etaLabel}</Text>
            </View>
            <Text style={styles.etaDistance}>~{Math.round(nextStop.distanceM)} m</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          <Stat label="Velocidad" value={`${Math.round(bus.speed)} km/h`} />
          <Stat label="Dirección" value={`${Math.round(bus.heading)}°`} />
        </View>

        <Text style={styles.updated}>Act. {formatClock(new Date(bus.lastUpdate))}</Text>
      </ScrollView>
    </View>
  );
}

/** "hace Ns" con su punto de color (se actualiza cada segundo), o "Simulación". */
function Freshness({ live, lastUpdate }: { live: boolean; lastUpdate: number }) {
  const styles = useStyles();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  if (!live) return <Text style={styles.simulated}>Simulación</Text>;
  const ageSec = Math.max(0, Math.round((now - lastUpdate) / 1000));
  const color = freshnessColor(ageSec);
  return (
    <View style={styles.freshness}>
      <View style={[styles.freshDot, { backgroundColor: color }]} />
      <Text style={[styles.freshText, { color }]}>hace {ageSec}s</Text>
    </View>
  );
}

function Stat({ label, value, valueColor = '#f1f5f9', background = 'rgba(255,255,255,0.05)' }: { label: string; value: string; valueColor?: string; background?: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.stat, { backgroundColor: background }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Prediction({ occupancy }: { occupancy: OccupancyInfo }) {
  const styles = useStyles();
  const colors = PREDICTION_COLORS[occupancy.occupancyLevel] ?? PREDICTION_COLORS.LOW;
  return (
    <View style={[styles.prediction, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.predictionText, { color: colors.text }]}>
        📊 Predicción: <Text style={styles.predictionValue}>{Math.round(occupancy.predictedRatio * 100)}%</Text>
      </Text>
      <Text style={styles.predictionMeta}>
        ±{Math.round(occupancy.confidence * 100)}% · {occupancy.predictorName}
      </Text>
    </View>
  );
}

// Colores y medidas de la ventanita del web (fondo hsl(220, 20%, 14%), radio 12).
const useStyles = makeStyles((_colors, font) => ({
  card: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    maxHeight: '70%',
    backgroundColor: '#1c2129',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radius.lg,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  content: { paddingVertical: 14, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flexShrink: 1 },
  busEmoji: { fontSize: font(20) },
  busId: { fontSize: font(14), fontWeight: '700', color: '#f1f5f9' },
  routeName: { fontSize: font(11), color: '#94a3b8' },
  close: { padding: 2 },
  simulated: { fontSize: font(10), color: '#475569' },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  freshText: { fontSize: font(10), fontVariant: ['tabular-nums'] },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    fontSize: font(10),
    fontWeight: '700',
    overflow: 'hidden',
  },
  section: { marginTop: 8 },
  occupancyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  occupancyLabel: { fontSize: font(11), color: '#94a3b8' },
  occupancyPct: { fontSize: font(11), fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  passengers: { fontSize: font(10), color: '#64748b', marginTop: 3 },
  grid: { flexDirection: 'row', gap: 6, marginTop: 8 },
  stat: { flex: 1, borderRadius: radius.md, paddingVertical: 7, paddingHorizontal: 9 },
  statLabel: { fontSize: font(10), color: '#64748b' },
  statValue: { fontSize: font(13), fontWeight: '700', fontVariant: ['tabular-nums'] },
  prediction: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  predictionText: { fontSize: font(11), fontWeight: '600' },
  predictionValue: { fontWeight: '800' },
  predictionMeta: { fontSize: font(10), color: '#64748b', flexShrink: 1, textAlign: 'right' },
  eta: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.18)',
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  etaTitle: { fontSize: font(10), color: '#64748b', marginBottom: 4 },
  etaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  etaStop: { flex: 1, fontSize: font(11), fontWeight: '600', color: '#c7d2fe' },
  etaTime: { fontSize: font(13), fontWeight: '700', color: '#a5b4fc', fontVariant: ['tabular-nums'] },
  etaDistance: { fontSize: font(10), color: '#475569', marginTop: 2 },
  updated: { fontSize: font(10), color: '#475569', marginTop: 8, textAlign: 'right' },
}));
