import type { Stop } from '../location/geo';
import { apiRequest } from './client';
import { fetchAllStops } from './stopsApi';

export type TripPreference = 'fastest' | 'min_transfers' | 'shortest' | 'least_walk';

export interface PlannedMovement {
  from_stop_id: string;
  to_stop_id: string;
  mode: 'walk' | 'bus';
  route_id?: string;
  trip_id?: string;
  time_seconds: number;
  distance_meters: number;
}

export interface RoutePlan {
  origin_stop_id: string;
  destination_stop_id: string;
  total_time_seconds: number;
  total_distance_meters: number;
  transfers: number;
  movements: PlannedMovement[];
}

interface TransitRoutesResponse {
  routes?: Array<{ id?: string; short_name?: string; long_name?: string }>;
}

const PREFERENCES: TripPreference[] = ['fastest', 'min_transfers', 'shortest', 'least_walk'];

export { fetchAllStops };

export async function fetchTransitRouteLabels(): Promise<Record<string, string>> {
  const response = await apiRequest<TransitRoutesResponse | null>('/integrations/micro/routes');
  return Object.fromEntries(
    (response?.routes ?? [])
      .filter((route): route is { id: string; short_name?: string; long_name?: string } => Boolean(route.id))
      .map((route) => [route.id, route.short_name?.trim() || route.long_name?.trim() || route.id]),
  );
}

function pathKey(plan: RoutePlan): string {
  return plan.movements.map((movement) => `${movement.mode}:${movement.route_id ?? ''}:${movement.to_stop_id}`).join('|');
}

/**
 * Solicita rutas candidatas de los cuatro criterios disponibles, elimina duplicados y
 * ordena las opciones por duración total para que la primera sea la sugerida.
 */
export async function fetchRouteAlternatives(origin: Stop, destination: Stop): Promise<RoutePlan[]> {
  const candidates = await Promise.all(
    PREFERENCES.map((preference) => {
      const params = new URLSearchParams({
        from_stop: origin.id,
        to_stop: destination.id,
        preference,
      });
      return apiRequest<RoutePlan>(`/integrations/micro/routes/plan?${params.toString()}`);
    }),
  );
  const unique = new Map<string, RoutePlan>();
  for (const plan of candidates) {
    const key = pathKey(plan);
    if (!unique.has(key)) unique.set(key, plan);
  }
  return [...unique.values()].sort((left, right) => left.total_time_seconds - right.total_time_seconds);
}
