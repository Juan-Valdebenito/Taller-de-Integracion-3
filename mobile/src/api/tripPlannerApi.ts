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
  /** Solo en las rutas recomendadas: la frase para el pasajero. */
  explanation?: string;
  /** Solo en las rutas recomendadas: espera estimada en los paraderos, en segundos. */
  wait_seconds?: number;
}

/** Prioridades que acepta GET /recommendations/route. */
export type RoutePriority = 'balanced' | 'fastest' | 'fewest_transfers' | 'least_walking';

interface RecommendationsResponse {
  routes?: Array<Omit<RoutePlan, 'origin_stop_id' | 'destination_stop_id' | 'wait_seconds'> & { cost?: { wait?: number } }>;
  cost_weights?: { wait_weight?: number } | null;
}

export interface WeatherTelemetry {
  time: string;
  station_id: string;
  sector: string;
  temperature_c: number;
  humidity_pct: number;
  wind_speed_kmh: number;
  pm25_ug_m3: number;
  pm10_ug_m3: number;
  status: string;
  latitude: number;
  longitude: number;
}

export async function fetchWeatherTelemetry(): Promise<WeatherTelemetry[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    limit: '20',
  });
  const response = await apiRequest<{ data?: WeatherTelemetry[] }>(`/mapinfo/climate/telemetry?${params.toString()}`);
  return response?.data ?? [];
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
 * Rutas recomendadas por backend-go, ya ordenadas de la más conveniente a la menos:
 * consideran la ocupación predicha, el clima y el GPS de las micros. Exige sesión.
 * La espera llega ponderada en el costo; se divide por su peso para tenerla en segundos.
 */
export async function fetchRecommendedRoutes(origin: Stop, destination: Stop, priority: RoutePriority): Promise<RoutePlan[]> {
  const params = new URLSearchParams({ origin_stop: origin.id, destination_stop: destination.id, priority, limit: '3' });
  const response = await apiRequest<RecommendationsResponse | null>(`/recommendations/route?${params.toString()}`);
  const waitWeight = response?.cost_weights?.wait_weight ?? 0;
  return (response?.routes ?? []).map(({ cost, ...route }) => ({
    ...route,
    origin_stop_id: origin.id,
    destination_stop_id: destination.id,
    wait_seconds: waitWeight > 0 && cost?.wait !== undefined ? Math.round(cost.wait / waitWeight) : undefined,
  }));
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
