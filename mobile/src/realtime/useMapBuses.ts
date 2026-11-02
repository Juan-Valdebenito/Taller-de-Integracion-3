import { useEffect, useState } from 'react';

import type { LiveBus } from './liveBuses';
import { useRealRoutes } from './realRoutes';
import { initialSimulatedBuses, SIMULATION_INTERVAL_MS, stepSimulatedBus } from './simulatedBuses';
import { useRealtimeBuses, type RealtimeBusesState, type UseRealtimeBusesOptions } from './useRealtimeBuses';

/** Micros simuladas que se mueven cada 2 s mientras `enabled` (como el web). */
export function useSimulatedBuses(enabled: boolean, intervalMs: number = SIMULATION_INTERVAL_MS): LiveBus[] {
  const [buses, setBuses] = useState<LiveBus[]>(() => initialSimulatedBuses(Date.now()));
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setBuses((prev) => prev.map((bus) => stepSimulatedBus(bus, now)));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return buses;
}

export type BusSource = 'realtime' | 'simulated';

export interface MapBusesState {
  /** Micros a mostrar en el mapa. */
  buses: LiveBus[];
  /** De dónde salen: el WebSocket o la simulación de respaldo. */
  source: BusSource;
  realtime: RealtimeBusesState;
}

/**
 * Micros del mapa, con la misma regla que PassengerMapPage del web: si el
 * WebSocket está conectado se muestran sus micros; si no, las simuladas. La
 * simulación solo corre mientras no hay conexión. Escucha las 3 líneas del
 * web y también las rutas reales de la base (las de los conductores).
 */
export function useMapBuses(options?: UseRealtimeBusesOptions): MapBusesState {
  // Además de las 3 líneas del web, las rutas reales: ahí publican los conductores.
  const real = useRealRoutes(options?.routeIds === undefined);
  const realtime = useRealtimeBuses({ routeIds: real.routeIds, routeNames: real.routeNames, ...options });
  const connected = realtime.status === 'connected';
  const simulated = useSimulatedBuses(!connected);
  return connected
    ? { buses: realtime.buses, source: 'realtime', realtime }
    : { buses: simulated, source: 'simulated', realtime };
}
