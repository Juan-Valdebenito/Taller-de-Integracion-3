import { useEffect, useState } from 'react';

import type { LiveBus } from './liveBuses';
import { useRealRoutes, type RealRoute } from './realRoutes';
import { useRealtimeBuses, type RealtimeBusesState, type UseRealtimeBusesOptions } from './useRealtimeBuses';

const NO_BUSES: LiveBus[] = [];
const BUS_EVENT_MAX_AGE_MS = 60_000;
const SIMULATION_EVENT_MAX_AGE_MS = 15_000;

export interface MapBusesState {
  /** Micros a mostrar en el mapa; vacío sin conexión. */
  buses: LiveBus[];
  /** Si hay conexión en tiempo real. */
  live: boolean;
  realtime: RealtimeBusesState;
  routes: RealRoute[];
  routesLoading: boolean;
  routesError: string | null;
}

/**
 * Micros del mapa: eventos GPS reales con prioridad por ruta y las posiciones
 * simuladas anteriores como respaldo cuando una ruta no tiene telemetría real.
 */
export function useMapBuses(options?: UseRealtimeBusesOptions): MapBusesState {
  const real = useRealRoutes(options?.routeIds === undefined);
  const realtime = useRealtimeBuses({ routeIds: real.routeIds, routeNames: real.routeNames, ...options });
  const live = realtime.status === 'connected';
  const [freshnessClock, setFreshnessClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setFreshnessClock(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const freshBuses = live
    ? realtime.buses.filter((bus) => {
      const isSimulation = bus.dataSource === 'simulation' || bus.id.startsWith('sim-');
      const maxAge = isSimulation ? SIMULATION_EVENT_MAX_AGE_MS : BUS_EVENT_MAX_AGE_MS;
      return Number.isFinite(bus.latitude)
        && Number.isFinite(bus.longitude)
        && freshnessClock - bus.lastUpdate <= maxAge;
    })
    : NO_BUSES;
  const routesWithLiveBuses = new Set(
    freshBuses
      .filter((bus) => bus.dataSource !== 'simulation' && !bus.id.startsWith('sim-'))
      .map((bus) => bus.routeId),
  );
  const buses = freshBuses.filter((bus) => (
    (bus.dataSource !== 'simulation' && !bus.id.startsWith('sim-'))
    || !routesWithLiveBuses.has(bus.routeId)
  ));

  return {
    buses,
    live,
    realtime,
    routes: real.routes,
    routesLoading: real.loading,
    routesError: real.error,
  };
}
