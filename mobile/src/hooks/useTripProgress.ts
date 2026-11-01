import { useEffect, useMemo, useState } from 'react';

import type { RouteStop } from '../api/companyApi';
import { advanceReached, elapsedMinutes, tripProgress, type TripProgress } from '../company/tripProgress';
import type { Coordinates } from '../location/geo';

/**
 * Avance del recorrido: recuerda el último paradero alcanzado y lo adelanta
 * con cada posición nueva de la micro. Empieza de cero al cambiar de ruta.
 */
export function useTripProgress(routeId: string, stops: readonly RouteStop[], position: Coordinates | null): TripProgress & { reached: number } {
  const [reached, setReached] = useState(-1);

  useEffect(() => {
    setReached(-1);
  }, [routeId]);

  useEffect(() => {
    setReached((current) => advanceReached(current, stops, position));
  }, [stops, position]);

  return useMemo(() => ({ ...tripProgress(reached, stops.length), reached }), [reached, stops.length]);
}

/** Minutos desde el inicio del recorrido, actualizados cada 15 s. */
export function useElapsedMinutes(startedAt: number, intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return elapsedMinutes(startedAt, now);
}
