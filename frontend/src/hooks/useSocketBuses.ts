/**
 * useSocketBuses.ts
 *
 * Hook que conecta al WebSocket del backend Go y actualiza el estado
 * de buses en tiempo real con datos de ubicación + aforo + predicción.
 *
 * Expone estado de conexión reactivo para UI (connecting/connected/disconnected),
 * latencia estimada y tasa de mensajes por segundo.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { BusState } from './useSimulatedBuses';
import {
  connectWS,
  disconnectWS,
  onMessage,
  subscribe,
  isConnected,
  type BusUpdatePayload,
  type OccupancyInfo,
} from '../infrastructure/socket/socketClient';
import { useWebSocketStatus } from '../presentation/context/WebSocketStatusContext';

// ── Tipos exportados ──────────────────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface SocketBusesState {
  /** Estado de la conexión WebSocket */
  status: ConnectionStatus;
  /** Latencia estimada en ms (timestamp del servidor vs hora local) */
  latencyMs: number;
  /** Mensajes por segundo recibidos */
  messagesPerSecond: number;
  /** Total de mensajes recibidos */
  totalMessages: number;
}

type BusUpdater = (updater: (prev: BusState[]) => BusState[]) => void;

// ── Nombres de ruta (para buses nuevos del WS) ───────────────────────────

const ROUTE_NAMES: Record<string, string> = {
  'route-1': 'Ruta 1 — Centro / Hospital',
  'route-3': 'Ruta 3 — Amanecer / Costanera',
};

const DEFAULT_ROUTE_IDS = ['route-1', 'route-3'];

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Se conecta al WebSocket del backend Go y aplica las actualizaciones
 * de posición y aforo sobre el estado de buses.
 *
 * @param setBuses — setter del estado de buses
 * @param enabled  — permite desactivar la conexión
 * @param routeIds — rutas a las que suscribirse
 */
export function useSocketBuses(
  setBuses: BusUpdater,
  enabled = true,
  routeIds: string[] = DEFAULT_ROUTE_IDS,
): SocketBusesState {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latencyMs, setLatencyMs] = useState(0);
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const { setStatus: setGlobalStatus } = useWebSocketStatus();

  // Counters para calcular msg/s
  const msgCountRef = useRef(0);
  const totalMsgRef = useRef(0);

  const handleBusUpdate = useCallback(
    (data: BusUpdatePayload) => {
      const now = new Date();

      // Estimar latencia
      if (data.timestamp) {
        const serverTime = new Date(data.timestamp).getTime();
        const lag = Math.max(0, now.getTime() - serverTime);
        setLatencyMs(lag);
      }

      // Construir occupancy info del WS
      const wsOccupancy: OccupancyInfo | undefined = data.occupancy
        ? {
            currentRatio: data.occupancy.currentRatio,
            predictedRatio: data.occupancy.predictedRatio,
            occupancyLevel: data.occupancy.occupancyLevel,
            occupancyText: data.occupancy.occupancyText,
            occupancyColor: data.occupancy.occupancyColor,
            confidence: data.occupancy.confidence,
            isSimulated: data.occupancy.isSimulated,
            predictorName: data.occupancy.predictorName,
          }
        : undefined;

      msgCountRef.current++;
      totalMsgRef.current++;
      setTotalMessages(totalMsgRef.current);

      setBuses((prev) => {
        const exists = prev.some((bus) => bus.id === data.busId);

        if (exists) {
          // Actualizar bus existente
          return prev.map((bus) =>
            bus.id === data.busId
              ? {
                  ...bus,
                  latitude: data.latitude,
                  longitude: data.longitude,
                  heading: data.heading ?? bus.heading,
                  speed: data.speed ?? bus.speed,
                  currentPassengers: data.currentPassengers ?? bus.currentPassengers,
                  capacity: data.capacity ?? bus.capacity,
                  status: 'ACTIVE' as const,
                  lastUpdate: now,
                  wsOccupancy,
                  lastWsUpdate: now,
                }
              : bus,
          );
        } else {
          // Bus nuevo del WS — agregar
          const newBus: BusState = {
            id: data.busId,
            routeId: data.routeId,
            routeName: ROUTE_NAMES[data.routeId] || `Ruta ${data.routeId}`,
            latitude: data.latitude,
            longitude: data.longitude,
            heading: data.heading ?? 0,
            speed: data.speed ?? 0,
            currentPassengers: data.currentPassengers ?? 0,
            capacity: data.capacity ?? 80,
            status: 'ACTIVE',
            lastUpdate: now,
            wsOccupancy,
            lastWsUpdate: now,
          };
          return [...prev, newBus];
        }
      });
    },
    [setBuses],
  );

  useEffect(() => {
    if (!enabled) return;

    setStatus('connecting');
    setGlobalStatus('connecting');

    try {
      // Registrar handler de mensajes
      const removeHandler = onMessage((msg) => {
        if (msg.type === 'bus:update') {
          handleBusUpdate(msg.data);
        } else if (msg.type === 'error') {
          console.warn('[WS] Error del servidor:', msg.message);
        }
      });

      // Conectar
      connectWS();

      // Suscribirse a las rutas
      for (const routeId of routeIds) {
        subscribe('route', routeId);
      }

      // Polling de estado de conexión
      const statusInterval = setInterval(() => {
        const connected = isConnected();
        setStatus((prev) => {
          if (connected && prev !== 'connected') return 'connected';
          if (!connected && prev !== 'disconnected') return 'disconnected';
          return prev;
        });
      }, 500);

      // Calcular msg/s cada segundo
      const rateInterval = setInterval(() => {
        setMessagesPerSecond(msgCountRef.current);
        msgCountRef.current = 0;
      }, 1000);

      return () => {
        removeHandler();
        clearInterval(statusInterval);
        clearInterval(rateInterval);
        try {
          disconnectWS();
          setStatus('disconnected');
          setGlobalStatus('idle');
        } catch {
          // silencioso
        }
      };
    } catch {
      setStatus('disconnected');
      return undefined;
    }
  }, [enabled, handleBusUpdate, routeIds, setGlobalStatus]);

  useEffect(() => {
    setGlobalStatus(status);
  }, [setGlobalStatus, status]);

  return { status, latencyMs, messagesPerSecond, totalMessages };
}
