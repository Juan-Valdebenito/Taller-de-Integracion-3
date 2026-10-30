import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { useEta } from '../../hooks/useEta';
import type { LiveBus } from '../../realtime/liveBuses';
import { BUS_STATUS, makeStyles, occupancyColor } from '../../theme';
import { freshnessColor, occupancyPercent } from './BusDetailCard';
import { busColor } from './busIcon';

/** Micros ordenadas por ocupación, la más llena primero (como BusSidePanel del web). */
export function sortByOccupancy(buses: readonly LiveBus[]): LiveBus[] {
  return [...buses].sort((a, b) => b.currentPassengers / b.capacity - a.currentPassengers / a.capacity);
}

/** Resumen del panel: "3 en pantalla · ordenadas por ocupación". */
export const busListSummary = (count: number) => `${count} en pantalla · ordenadas por ocupación`;

export interface BusListProps {
  /** Micros ya filtradas por línea. */
  buses: readonly LiveBus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** true si los datos vienen del tiempo real (punto de frescura y destello). */
  live: boolean;
  /** Mientras se conecta por primera vez, como el web. */
  loading?: boolean;
}

/**
 * Lista "Micros activas", como BusSidePanel del web: cada micro con su estado,
 * ocupación, velocidad, próxima parada y predicción. Tocar una la elige.
 */
export function BusList({ buses, selectedId, onSelect, live, loading = false }: BusListProps) {
  const styles = useStyles();
  if (loading) return <BusListSkeleton />;
  if (buses.length === 0) return <Text style={styles.empty}>No hay micros en esta ruta</Text>;
  return (
    <View>
      {sortByOccupancy(buses).map((bus) => (
        <BusRow key={bus.id} bus={bus} selected={bus.id === selectedId} onSelect={onSelect} live={live} />
      ))}
    </View>
  );
}

function BusRow({ bus, selected, onSelect, live }: { bus: LiveBus; selected: boolean; onSelect: (id: string) => void; live: boolean }) {
  const styles = useStyles();
  const pct = occupancyPercent(bus);
  const status = BUS_STATUS[bus.status];
  const occColor = busColor(bus);
  const { nextStop, isStopped } = useEta(bus);

  // Destello cuando llega un dato nuevo del tiempo real (bus-row-flash del web).
  const flash = useRef(new Animated.Value(0)).current;
  const lastUpdate = useRef(bus.lastUpdate);
  useEffect(() => {
    if (!live || bus.lastUpdate === lastUpdate.current) return;
    lastUpdate.current = bus.lastUpdate;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 600, useNativeDriver: false }).start();
  }, [bus.lastUpdate, live, flash]);

  const freshColor = live ? freshnessColor(Math.round((Date.now() - bus.lastUpdate) / 1000)) : '#475569';

  return (
    <Pressable
      onPress={() => onSelect(bus.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Micro ${bus.id}, ${bus.routeName}, ${status.label}, ${pct}% ocupado`}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flash }]}
      />
      <View style={styles.top}>
        <View style={styles.inline}>
          <Text style={styles.emoji}>🚌</Text>
          <Text style={styles.busId}>{bus.id}</Text>
          <View style={[styles.dot, { backgroundColor: freshColor }]} />
        </View>
        <View style={styles.inline}>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={styles.status}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.routeName} numberOfLines={1}>{bus.routeName}</Text>

      <View style={styles.occupancy}>
        <Text style={[styles.pct, { color: occColor }]}>{pct}% ocupado</Text>
        <Text style={styles.speed}>{Math.round(bus.speed)} km/h</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: occupancyColor(bus.currentPassengers, bus.capacity) }]} />
      </View>

      {!isStopped && nextStop ? (
        <View style={styles.eta}>
          <Text style={styles.etaChip}>⏱ {nextStop.etaLabel}</Text>
          <Text style={styles.etaStop} numberOfLines={1}>{nextStop.stopName}</Text>
        </View>
      ) : null}

      {bus.occupancy ? (
        <View style={[styles.prediction, { backgroundColor: `${occColor}15`, borderColor: `${occColor}25` }]}>
          <Text style={[styles.predictionText, { color: occColor }]}>📊 Pred: {Math.round(bus.occupancy.predictedRatio * 100)}%</Text>
          <Text style={styles.predictionLevel}>{bus.occupancy.occupancyLevel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Filas de carga mientras llega el primer dato (BusListSkeleton del web). */
function BusListSkeleton() {
  const styles = useStyles();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando micros">
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonContent}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, { width: '45%' }]} />
            <View style={styles.skeletonBar} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Colores y medidas de BusSidePanel del web.
const useStyles = makeStyles((_colors, font) => ({
  empty: { paddingVertical: 20, paddingHorizontal: 16, textAlign: 'center', color: '#475569', fontSize: font(12) },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    overflow: 'hidden',
  },
  rowSelected: { backgroundColor: 'rgba(99, 102, 241, 0.12)', borderLeftColor: '#818cf8' },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(99, 102, 241, 0.15)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: font(14) },
  busId: { fontSize: font(13), fontWeight: '700', color: '#f1f5f9' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: font(10), color: '#94a3b8' },
  routeName: { fontSize: font(11), color: '#64748b', marginBottom: 4 },
  occupancy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pct: { fontSize: font(11), fontWeight: '700', fontVariant: ['tabular-nums'] },
  speed: { fontSize: font(10), color: '#94a3b8', fontVariant: ['tabular-nums'] },
  track: { height: 4, marginTop: 6, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9999 },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  etaChip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.20)',
    backgroundColor: 'rgba(99,102,241,0.10)',
    color: '#a5b4fc',
    fontSize: font(10),
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  },
  etaStop: { flexShrink: 1, fontSize: font(10), color: '#94a3b8' },
  prediction: {
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  predictionText: { fontSize: font(10) },
  predictionLevel: { fontSize: font(10), color: '#64748b' },
  skeletonRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  skeletonCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  skeletonContent: { flex: 1, gap: 6 },
  skeletonLine: { height: 10, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  skeletonBar: { height: 4, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.06)' },
}));
