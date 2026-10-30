import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';

import type { LiveBus } from '../../realtime/liveBuses';
import type { RealtimeBusesState } from '../../realtime/useRealtimeBuses';
import type { ConnectionStatus } from '../../realtime/types';
import { makeStyles, radius } from '../../theme';
import type { RouteFilterValue } from './routeNodes';

/** Estados de conexión, con las etiquetas y colores del web. */
export const CONNECTION_CONFIG: Readonly<Record<ConnectionStatus, { label: string; color: string; pulse: boolean }>> = {
  connected: { label: 'Tiempo real', color: '#22c55e', pulse: false },
  connecting: { label: 'Conectando...', color: '#f59e0b', pulse: true },
  disconnected: { label: 'Desconectado', color: '#ef4444', pulse: false },
};

export interface MapStatusBarProps {
  buses: readonly LiveBus[];
  realtime: Pick<RealtimeBusesState, 'status' | 'latencyMs' | 'messagesPerSecond' | 'totalMessages'>;
  routeFilter?: RouteFilterValue;
}

/** Hora con segundos, como el web (toLocaleTimeString es-CL). */
export const formatClock = (date: Date) =>
  date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, opacity]);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity }} />;
}

/**
 * Barra de estado del mapa, como MapStatusBar del web: conexión, latencia y
 * mensajes por segundo (con conexión), micros en ruta / detenidas /
 * retrasadas, "Filtro activo", total de mensajes y la hora (cada segundo). En
 * el teléfono va en una línea que se desliza de lado si no cabe.
 */
export function MapStatusBar({ buses, realtime, routeFilter = 'all' }: MapStatusBarProps) {
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const count = (status: LiveBus['status']) => buses.filter((bus) => bus.status === status).length;
  const active = count('ACTIVE');
  const stopped = count('STOPPED');
  const delayed = count('DELAYED');
  const connection = CONNECTION_CONFIG[realtime.status];
  const connected = realtime.status === 'connected';

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <View
          style={[styles.pill, { backgroundColor: `${connection.color}15`, borderColor: `${connection.color}30` }]}
          accessible
          accessibilityLabel={`Conexión: ${connection.label}`}
        >
          <StatusDot color={connection.color} pulse={connection.pulse} />
          <Text style={[styles.pillText, { color: connection.color }]}>{connection.label}</Text>
        </View>
        <View style={styles.separator} />
        {connected ? (
          <>
            <Text style={styles.metric} accessibilityLabel={`Latencia ${realtime.latencyMs} milisegundos`}>
              📡 <Text style={styles.latency}>{realtime.latencyMs}ms</Text>
            </Text>
            <Text style={styles.metric} accessibilityLabel={`${realtime.messagesPerSecond} mensajes por segundo`}>
              📨 <Text style={styles.rate}>{realtime.messagesPerSecond}/s</Text>
            </Text>
            <View style={styles.separator} />
          </>
        ) : null}
        <View style={styles.counter}>
          <StatusDot color="#22c55e" />
          <Text style={styles.counterText}>{active} en ruta</Text>
        </View>
        {stopped > 0 ? (
          <View style={styles.counter}>
            <StatusDot color="#f59e0b" />
            <Text style={styles.counterText}>{stopped} detenidas</Text>
          </View>
        ) : null}
        {delayed > 0 ? (
          <View style={styles.counter}>
            <StatusDot color="#ef4444" />
            <Text style={styles.counterText}>{delayed} retrasadas</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        {routeFilter !== 'all' ? <Text style={styles.filterBadge}>Filtro activo</Text> : null}
        {realtime.totalMessages > 0 ? <Text style={styles.total}>{realtime.totalMessages} msgs</Text> : null}
        <Text style={styles.clock}>{formatClock(now)}</Text>
      </ScrollView>
    </View>
  );
}

// Medidas y colores del web: barra de 40 px sobre hsl(220, 20%, 10%).
const useStyles = makeStyles((_colors, font) => ({
  bar: { height: 40, backgroundColor: '#14171f', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 16, minWidth: '100%' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1 },
  pillText: { fontSize: font(11), fontWeight: '600' },
  separator: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  metric: { fontSize: font(11), color: '#64748b' },
  latency: { color: '#c084fc', fontWeight: '600', fontVariant: ['tabular-nums'] },
  rate: { color: '#818cf8', fontWeight: '600', fontVariant: ['tabular-nums'] },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  counterText: { fontSize: font(11), color: '#94a3b8' },
  spacer: { flexGrow: 1 },
  filterBadge: {
    fontSize: font(11),
    color: '#5e9aed', // hsl(215, 80%, 65%)
    backgroundColor: 'rgba(48, 125, 232, 0.15)', // hsla(215, 80%, 55%, 0.15)
    borderWidth: 1,
    borderColor: 'rgba(48, 125, 232, 0.25)',
    borderRadius: radius.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  total: { fontSize: font(10), color: '#475569', fontVariant: ['tabular-nums'] },
  clock: { fontSize: font(11), color: '#475569', fontVariant: ['tabular-nums'] },
}));
