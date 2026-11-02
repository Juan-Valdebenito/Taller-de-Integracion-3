import { apiClient } from './apiClient';

export interface MicroStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface MicroStopsResponse {
  stops: MicroStop[];
  total: number;
}

export interface MicroStopsQuery {
  limit?: number;
  lat?: number;
  long?: number;
  radius_m?: number;
}

const isMicroStop = (value: unknown): value is MicroStop => {
  if (!value || typeof value !== 'object') return false;

  const stop = value as Partial<MicroStop>;
  return (
    typeof stop.id === 'string' &&
    typeof stop.name === 'string' &&
    typeof stop.latitude === 'number' &&
    Number.isFinite(stop.latitude) &&
    typeof stop.longitude === 'number' &&
    Number.isFinite(stop.longitude)
  );
};

export const microStopsApi = {
  async getAll(query?: MicroStopsQuery): Promise<MicroStopsResponse> {
    const response = await apiClient.get<Partial<MicroStopsResponse>>('/integrations/micro/stops', {
      params: query,
    });

    const stops = Array.isArray(response.data.stops)
      ? response.data.stops.filter(isMicroStop)
      : [];

    return {
      stops,
      total: typeof response.data.total === 'number' ? response.data.total : stops.length,
    };
  },
};