import { useEffect, useRef, useState } from 'react';

import { applyBusUpdate, DEFAULT_ROUTE_IDS, latencyOf, type LiveBus } from './liveBuses';
import { RealtimeClient } from './RealtimeClient';
import type { ConnectionStatus } from './types';
import { resolveWsUrl } from './wsUrl';

export interface RealtimeBusesState {
  /** Micros recibidas por el WebSocket. */
  buses: LiveBus[];
  status: ConnectionStatus;
  /** Latencia estimada del último mensaje (ms). */
  latencyMs: number;
  /** Mensajes recibidos en el último segundo. */
  messagesPerSecond: number;
  totalMessages: number;
}

export interface UseRealtimeBusesOptions {
  enabled?: boolean;
  /** Rutas a escuchar. Si cambian, se suscribe o desuscribe sin reconectar. */
  routeIds?: readonly string[];
  /** Nombre a mostrar de rutas que no son las 3 líneas del web. */
  routeNames?: Readonly<Record<string, string>>;
  /** Cliente a usar (tests); por defecto uno nuevo hacia el WebSocket de backend-go. */
  createClient?: () => RealtimeClient;
}

/**
 * Micros en tiempo real por el WebSocket de backend-go, como useSocketBuses
 * del web: se conecta, se suscribe a las rutas y actualiza cada micro con los
 * mensajes bus:update. Al desmontarse cierra la conexión.
 */
export function useRealtimeBuses({
  enabled = true,
  routeIds = DEFAULT_ROUTE_IDS,
  routeNames,
  createClient = () => new RealtimeClient(resolveWsUrl()),
}: UseRealtimeBusesOptions = {}): RealtimeBusesState {
  const [buses, setBuses] = useState<LiveBus[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latencyMs, setLatencyMs] = useState(0);
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const secondCount = useRef(0);
  const createClientRef = useRef(createClient);
  const routesKey = routeIds.join(',');
  const clientRef = useRef<RealtimeClient | null>(null);
  const subscribed = useRef(new Set<string>());
  const routeNamesRef = useRef(routeNames);
  routeNamesRef.current = routeNames;

  useEffect(() => {
    if (!enabled) return;
    const client = createClientRef.current();
    clientRef.current = client;

    const offStatus = client.onStatus(setStatus);
    const offMessage = client.onMessage((msg) => {
      if (msg.type !== 'bus:update') return;
      const now = Date.now();
      const latency = latencyOf(msg.data, now);
      if (latency !== null) setLatencyMs(latency);
      secondCount.current += 1;
      setTotalMessages((total) => total + 1);
      setBuses((prev) => applyBusUpdate(prev, msg.data, now, routeNamesRef.current));
    });
    const perSecond = setInterval(() => {
      setMessagesPerSecond(secondCount.current);
      secondCount.current = 0;
    }, 1000);

    client.connect();

    return () => {
      clearInterval(perSecond);
      offMessage();
      offStatus();
      client.disconnect();
      clientRef.current = null;
      subscribed.current = new Set();
      setStatus('disconnected');
    };
  }, [enabled]);

  // Suscripciones sobre la misma conexión: agregar una ruta no la corta.
  useEffect(() => {
    const client = clientRef.current;
    if (!enabled || !client) return;
    const wanted = new Set(routesKey.split(',').filter(Boolean));
    for (const routeId of wanted) {
      if (!subscribed.current.has(routeId)) client.subscribe('route', routeId);
    }
    for (const routeId of subscribed.current) {
      if (!wanted.has(routeId)) client.unsubscribe('route', routeId);
    }
    subscribed.current = wanted;
  }, [enabled, routesKey]);

  return { buses, status, latencyMs, messagesPerSecond, totalMessages };
}
