import { apiClient } from './apiClient';

export interface ClimateTelemetryRecord {
  time: string;
  station_id: string;
  sector: string;
  temperature_c: number;
  humidity_pct: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  pm25_ug_m3: number;
  pm10_ug_m3: number;
  status: string;
  latitude: number;
  longitude: number;
}

export interface ClimateTelemetryQuery {
  from: string;
  to: string;
  limit: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseTimestamp = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (!isObject(value)) return null;

  if (typeof value.seconds !== 'number' && typeof value.seconds !== 'string') return null;

  const seconds = Number(value.seconds);
  const nanos = value.nanos ?? 0;
  if (!Number.isFinite(seconds) || typeof nanos !== 'number' || !Number.isFinite(nanos)) return null;

  const date = new Date(seconds * 1000 + nanos / 1_000_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isTelemetryRecord = (value: unknown): value is ClimateTelemetryRecord => {
  if (!isObject(value)) return false;

  const time = parseTimestamp(value.time);
  const precipitation = value.precipitation_mm ?? 0;
  if (
    !time ||
    typeof value.station_id !== 'string' ||
    !value.station_id.trim() ||
    typeof value.sector !== 'string' ||
    typeof value.status !== 'string' ||
    !isFiniteNumber(value.temperature_c) ||
    !isFiniteNumber(value.humidity_pct) ||
    !isFiniteNumber(value.wind_speed_kmh) ||
    !isFiniteNumber(precipitation) ||
    precipitation < 0 ||
    !isFiniteNumber(value.pm25_ug_m3) ||
    !isFiniteNumber(value.pm10_ug_m3) ||
    !isFiniteNumber(value.latitude) ||
    !isFiniteNumber(value.longitude) ||
    value.latitude < -90 || value.latitude > 90 ||
    value.longitude < -180 || value.longitude > 180
  ) {
    return false;
  }

  return true;
};

export const climateTelemetryApi = {
  async getAll(query: ClimateTelemetryQuery): Promise<ClimateTelemetryRecord[]> {
    const response = await apiClient.get<unknown>('/mapinfo/climate/telemetry', {
      params: query,
    });

    if (!isObject(response.data) || !Array.isArray(response.data.data)) return [];

    return response.data.data.flatMap((record) => {
      if (!isTelemetryRecord(record)) return [];
      const time = parseTimestamp(record.time);
      if (!time) return [];
      return [{ ...record, time, precipitation_mm: record.precipitation_mm ?? 0 }];
    });
  },
};