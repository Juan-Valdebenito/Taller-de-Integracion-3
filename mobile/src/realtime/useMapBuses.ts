import type { LiveBus } from './liveBuses';
import { useRealRoutes } from './realRoutes';
import { useRealtimeBuses, type RealtimeBusesState, type UseRealtimeBusesOptions } from './useRealtimeBuses';

const NO_BUSES: LiveBus[] = [];

export interface MapBusesState {
  /** Micros a mostrar en el mapa; vacío sin conexión. */
  buses: LiveBus[];
  /** Si hay conexión en tiempo real. */
  live: boolean;
  realtime: RealtimeBusesState;
}

/**
 * Micros del mapa, con la misma regla que PassengerMapPage del web: siempre las
 * del WebSocket. Sin conexión no se muestra ninguna, porque su posición ya no
 * sería la actual. Escucha las 3 líneas del web y también las rutas reales de la
 * base (las de los conductores).
 */
export function useMapBuses(options?: UseRealtimeBusesOptions): MapBusesState {
  // Además de las 3 líneas del web, las rutas reales: ahí publican los conductores.
  const real = useRealRoutes(options?.routeIds === undefined);
  const realtime = useRealtimeBuses({ routeIds: real.routeIds, routeNames: real.routeNames, ...options });
  const live = realtime.status === 'connected';
  return { buses: live ? realtime.buses : NO_BUSES, live, realtime };
}
