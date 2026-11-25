/**
 * tripPlannerApi.ts
 *
 * Cliente HTTP para el microservicio de planificación de viajes (integración micro).
 * Equivalent al tripPlannerApi.ts de la app mobile, adaptado para el frontend web.
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

export interface RoutePlan {
  origin_stop_id: string;
  destination_stop_id: string;
  total_time_seconds: number;
  total_distance_meters: number;
  transfers: number;
  movements: PlannedMovement[];
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
  const { data } = await apiClient.get<{ data?: WeatherTelemetry[] }>('/mapinfo/climate/telemetry', {
    params: { from: from.toISOString(), to: to.toISOString(), limit: 20 },
  });
  return data?.data ?? [];
}

type TripPreference = 'fastest' | 'min_transfers' | 'shortest' | 'least_walk';
const PREFERENCES: TripPreference[] = ['fastest', 'min_transfers', 'shortest', 'least_walk'];

function pathKey(plan: RoutePlan): string {
  return plan.movements
    .map((m) => `${m.mode}:${m.route_id ?? ''}:${m.to_stop_id}`)
    .join('|');
}

export async function fetchAllStops(): Promise<Stop[]> {
  const { data } = await apiClient.get<{ stops?: Stop[] }>('/mapinfo/micro/stops?limit=1000');
  return data?.stops ?? [];
}

export async function fetchRouteAlternatives(origin: Stop, destination: Stop): Promise<RoutePlan[]> {
  const candidates = await Promise.all(
    PREFERENCES.map((preference) =>
      apiClient
        .get<RoutePlan>('/integrations/micro/routes/plan', {
          params: { from_stop: origin.id, to_stop: destination.id, preference },
        })
        .then((r) => r.data),
    ),
  );
  const unique = new Map<string, RoutePlan>();
  for (const plan of candidates) {
    const key = pathKey(plan);
    if (!unique.has(key)) unique.set(key, plan);
  }
  return [...unique.values()].sort((a, b) => a.total_time_seconds - b.total_time_seconds);
}
