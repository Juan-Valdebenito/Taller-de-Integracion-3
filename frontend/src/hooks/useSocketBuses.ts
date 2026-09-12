/**
 * useSocketBuses.ts
 *
 * Hook que escucha mensajes WebSocket del backend Go y actualiza
 * el estado de las micros en tiempo real (ubicación + aforo + predicción).
 *
 * Si el WebSocket falla o no está disponible, NO lanza errores —
 * simplemente no modifica el estado (la simulación local sigue activa).
 */

import { useEffect, useRef, useCallback } from 'react';
import { BusState } from './useSimulatedBuses';
import {
  connectWS,
  disconnectWS,
  onMessage,
  subscribe,
  isConnected,
  type BusUpdatePayload,
} from '../infrastructure/socket/socketClient';

type BusUpdater = (updater: (prev: BusState[]) => BusState[]) => void;

/**
 * Se conecta al WebSocket del backend Go y aplica las actualizaciones
 * de posición y aforo sobre el estado de buses existente.
 *
 * @param setBuses — setter del estado de buses de PassengerMapPage
 * @param enabled  — permite desactivar la conexión (ej: modo solo simulación)
 * @param routeIds — rutas a las que suscribirse (vacío = todas)
 */
export function useSocketBuses(
  setBuses: BusUpdater,
  enabled = true,
  routeIds: string[] = ['route-1', 'route-3'],
): boolean {
  const connectedRef = useRef(false);

  const handleBusUpdate = useCallback(
    (data: BusUpdatePayload) => {
      setBuses((prev) =>
        prev.map((bus) =>
          bus.id === data.busId
            ? {
                ...bus,
                latitude: data.latitude,
                longitude: data.longitude,
                heading: data.heading ?? bus.heading,
                speed: data.speed ?? bus.speed,
                currentPassengers: data.currentPassengers ?? bus.currentPassengers,
                capacity: data.capacity ?? bus.capacity,
                lastUpdate: new Date(data.timestamp),
              }
            : bus,
        ),
      );
    },
    [setBuses],
  );

  useEffect(() => {
    if (!enabled) return;

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

      // Polling de estado de conexión para el indicador visual
      const statusInterval = setInterval(() => {
        connectedRef.current = isConnected();
      }, 1000);

      return () => {
        removeHandler();
        clearInterval(statusInterval);
        try {
          disconnectWS();
          connectedRef.current = false;
        } catch {
          // silencioso
        }
      };
    } catch {
      // No bloquear si WebSocket no está disponible
      return undefined;
    }
  }, [enabled, handleBusUpdate, routeIds]);

  return connectedRef.current;
}
