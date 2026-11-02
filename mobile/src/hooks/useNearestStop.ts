import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '../api/errors';
import { fetchNearbyStops } from '../api/stopsApi';
import { MAX_LOCATION_ACCURACY_M, STOP_RADIUS_M, STOP_SEARCH_RADIUS_M } from '../config';
import { checkStopProximity, distanceInMeters, type Coordinates, type ProximityResult, type Stop } from '../location/geo';
import type { UserPosition } from '../location/locationService';

/**
 * Distancia que debe moverse el usuario para volver a pedir paraderos. Con un
 * radio de búsqueda de 1 km, los paraderos ya cargados siguen cubriendo el
 * radio de verificación mientras no se aleje más que esto del punto de consulta.
 */
export const REFETCH_DISTANCE_M = STOP_SEARCH_RADIUS_M / 5;

/**
 * Espera antes de reintentar automáticamente tras un error. Se duplica con cada
 * fallo seguido (30 s, 60 s, 120 s…) hasta RETRY_MAX_DELAY_MS, para no golpear
 * al backend con cada nueva posición del GPS mientras está caído.
 */
export const RETRY_BASE_DELAY_MS = 30_000;
export const RETRY_MAX_DELAY_MS = 5 * 60_000;

export function retryDelay(consecutiveFailures: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(0, consecutiveFailures - 1), RETRY_MAX_DELAY_MS);
}

export interface UseNearestStopResult {
  /** null hasta tener posición y paraderos cargados. */
  proximity: ProximityResult | null;
  /** true mientras se consultan los paraderos al backend. */
  loading: boolean;
  error: string | null;
  /** Vuelve a consultar los paraderos desde la posición actual. */
  reload: () => Promise<void>;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 0) {
    return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }
  if (e instanceof ApiError && e.status >= 500) {
    return 'El servicio de paraderos no está disponible. Intenta más tarde.';
  }
  return 'No se pudieron cargar los paraderos cercanos.';
}

/**
 * Paradero oficial más cercano y si el usuario está dentro del radio
 * configurado (STOP_RADIUS_M). El backend entrega los paraderos de la zona; la
 * verificación final la hace la app con Haversine en cada nueva posición.
 */
export function useNearestStop(position: UserPosition | null): UseNearestStopResult {
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Punto desde el que se consultaron los paraderos cargados. */
  const origin = useRef<Coordinates | null>(null);
  /** Descarta respuestas de consultas anteriores que lleguen tarde. */
  const requestId = useRef(0);
  const mounted = useRef(true);
  /** Última posición conocida, para el reintento programado. */
  const latest = useRef<Coordinates | null>(null);
  const failures = useRef(0);
  /** Reintento automático pendiente; mientras exista no se consulta con cada posición. */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRetry();
    };
  }, [cancelRetry]);

  const load = useCallback(
    async (from: Coordinates) => {
      const id = ++requestId.current;
      cancelRetry();
      origin.current = from;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchNearbyStops({ ...from, radiusMeters: STOP_SEARCH_RADIUS_M });
        if (mounted.current && id === requestId.current) {
          failures.current = 0;
          setStops(result);
        }
      } catch (e) {
        if (!mounted.current || id !== requestId.current) return;
        origin.current = null;
        failures.current += 1;
        setError(errorMessage(e));
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          if (latest.current) load(latest.current);
        }, retryDelay(failures.current));
      } finally {
        if (mounted.current && id === requestId.current) setLoading(false);
      }
    },
    [cancelRetry],
  );

  const latitude = position?.latitude;
  const longitude = position?.longitude;
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const current = { latitude, longitude };
    latest.current = current;
    if (retryTimer.current) return;
    if (origin.current && distanceInMeters(origin.current, current) < REFETCH_DISTANCE_M) return;
    load(current);
  }, [latitude, longitude, load]);

  /** Manual: consulta al instante aunque haya un reintento programado. */
  const reload = useCallback(async () => {
    if (latitude == null || longitude == null) return;
    await load({ latitude, longitude });
  }, [latitude, longitude, load]);

  const proximity = useMemo(
    () =>
      position && stops
        ? checkStopProximity(position, stops, { radiusMeters: STOP_RADIUS_M, maxAccuracyMeters: MAX_LOCATION_ACCURACY_M })
        : null,
    [position, stops],
  );

  return { proximity, loading, error, reload };
}
