/**
 * useSocketBuses.ts
 *
 * Hook que escucha eventos de Socket.io del backend y actualiza
 * el estado de las micros en tiempo real.
 * Si el socket falla o no está disponible, NO lanza errores —
 * simplemente no modifica el estado (la simulación local sigue activa).
 */

import { useEffect, useRef } from 'react';
import { BusState } from './useSimulatedBuses';
import { connectSocket, disconnectSocket, getSocket, SocketEvents } from '../infrastructure/socket/socketClient';

type BusUpdater = (updater: (prev: BusState[]) => BusState[]) => void;

interface SocketBusPayload {
  busId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

/**
 * Se conecta al Socket.io del backend y aplica las actualizaciones
 * de posición sobre el estado de buses existente (simulado o real).
 *
 * @param setBuses — setter del estado de buses de PassengerMapPage
 * @param enabled  — permite desactivar la conexión (ej: modo solo simulación)
 */
export function useSocketBuses(setBuses: BusUpdater, enabled = true): boolean {
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let socket: ReturnType<typeof getSocket> | null = null;

    try {
      socket = getSocket();

      socket.on('connect', () => {
        connectedRef.current = true;
        console.log('[Socket] Conectado al backend — usando datos reales');
      });

      socket.on('disconnect', () => {
        connectedRef.current = false;
        console.log('[Socket] Desconectado — volviendo a simulación local');
      });

      socket.on('connect_error', () => {
        // Backend no disponible — silencioso, la simulación local toma el control
        connectedRef.current = false;
      });

      socket.on(SocketEvents.BUS_LOCATION_BROADCAST, (data: SocketBusPayload) => {
        setBuses((prev) =>
          prev.map((bus) =>
            bus.id === data.busId
              ? {
                  ...bus,
                  latitude: data.latitude,
                  longitude: data.longitude,
                  heading: data.heading ?? bus.heading,
                  speed: data.speed ?? bus.speed,
                  lastUpdate: new Date(data.timestamp),
                }
              : bus,
          ),
        );
      });

      connectSocket();
    } catch {
      // No bloquear si socket.io no está disponible
    }

    return () => {
      try {
        disconnectSocket();
        connectedRef.current = false;
      } catch {
        // silencioso
      }
    };
  }, [enabled, setBuses]);

  return connectedRef.current;
}
