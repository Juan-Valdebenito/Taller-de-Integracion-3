/**
 * tripPlannerApi.ts
 *
 * Cliente HTTP del planificador de viajes. Las rutas vienen de
 * GET /api/v1/recommendations/route, que exige sesión: backend-go agrega la
 * ocupación predicha, el clima y el GPS, y micro_service las ordena por costo.
 */

import { apiClient } from './apiClient';

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface PlannedMovement {
  from_stop_id: string;
  to_stop_id: string;
  mode: 'walk' | 'bus';
  route_id?: string;
  trip_id?: string;
  time_seconds: number;
  distance_meters: number;
}

/** Desglose del costo con que se ordenó la ruta, en segundos equivalentes. */
export interface RouteCost {
  ride: number;
  walk: number;
  wait: number;
  transfer: number;
  crowding: number;
  weather: number;
  total: number;
}

/** Una ruta recomendada. total_time_seconds no incluye la espera en el paradero. */
export interface RecommendedRoute {
  total_time_seconds: number;
  total_distance_meters: number;
  transfers: number;
  movements: PlannedMovement[];
  cost: RouteCost;
  /** Frase para el pasajero; vacía si micro_service es anterior a la explicación. */
  explanation: string;
}

export type RoutePriority = 'balanced' | 'fastest' | 'fewest_transfers' | 'least_walking';

export const ROUTE_PRIORITIES: readonly { id: RoutePriority; label: string }[] = [
  { id: 'balanced', label: 'Equilibrada' },
  { id: 'fastest', label: 'Llegar antes' },
  { id: 'fewest_transfers', label: 'Menos transbordos' },
  { id: 'least_walking', label: 'Caminar menos' },
];

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
  const { data } = await apiClient.get<{ data?: WeatherTelemetry[] }>('/mapinfo/climate/telemetry', {
    params: { from: from.toISOString(), to: to.toISOString(), limit: 20 },
  });
  return data?.data ?? [];
}

export async function fetchAllStops(): Promise<Stop[]> {
  const { data } = await apiClient.get<{ stops?: Stop[] }>('/mapinfo/micro/stops?limit=1000');
  return data?.stops ?? [];
}

/** Hasta 3 rutas, de la más conveniente a la menos, según la prioridad del pasajero. */
export async function fetchRecommendedRoutes(
  origin: Stop,
  destination: Stop,
  priority: RoutePriority,
): Promise<RecommendedRoute[]> {
  const { data } = await apiClient.get<{ routes?: RecommendedRoute[] }>('/recommendations/route', {
    params: { origin_stop: origin.id, destination_stop: destination.id, priority, limit: 3 },
  });
  return data?.routes ?? [];
}

/** El mensaje de un 400 (por ejemplo, un paradero sin micros), o null. */
export function recommendationErrorMessage(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response;
  return response?.status === 400 && typeof response.data?.error === 'string' ? response.data.error : null;
}
