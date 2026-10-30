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
  routeIds?: readonly string[];
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

  useEffect(() => {
    if (!enabled) return;
    const client = createClientRef.current();
    const routes = routesKey.split(',').filter(Boolean);

    const offStatus = client.onStatus(setStatus);
    const offMessage = client.onMessage((msg) => {
      if (msg.type !== 'bus:update') return;
      const now = Date.now();
      const latency = latencyOf(msg.data, now);
      if (latency !== null) setLatencyMs(latency);
      secondCount.current += 1;
      setTotalMessages((total) => total + 1);
      setBuses((prev) => applyBusUpdate(prev, msg.data, now));
    });
    const perSecond = setInterval(() => {
      setMessagesPerSecond(secondCount.current);
      secondCount.current = 0;
    }, 1000);

    client.connect();
    for (const routeId of routes) client.subscribe('route', routeId);

    return () => {
      clearInterval(perSecond);
      offMessage();
      offStatus();
      client.disconnect();
      setStatus('disconnected');
    };
  }, [enabled, routesKey]);

  return { buses, status, latencyMs, messagesPerSecond, totalMessages };
}
