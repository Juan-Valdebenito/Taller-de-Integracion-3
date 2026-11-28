import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { fetchRecommendedRoutes, fetchWeatherTelemetry } from '../tripPlannerApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const origin = { id: 'PAR-CSF-01', name: 'Campus San Francisco', latitude: -38.7369, longitude: -72.6013 };
const destination = { id: 'PAR-DPORT-01', name: 'Diego Portales', latitude: -38.7375, longitude: -72.5893 };

describe('fetchRecommendedRoutes', () => {
  it('pide las rutas recomendadas con los paraderos y la prioridad, autenticado', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { routes: [] } }));

    await fetchRecommendedRoutes(origin, destination, 'least_walking');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/recommendations\/route$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      origin_stop: 'PAR-CSF-01', destination_stop: 'PAR-DPORT-01', priority: 'least_walking', limit: '3',
    });
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
  });

  it('conserva el orden, agrega los paraderos y calcula la espera en segundos', async () => {
    const movement = { from_stop_id: 'PAR-CSF-01', to_stop_id: 'PAR-DPORT-01', mode: 'bus', route_id: 'L7B', time_seconds: 300, distance_meters: 1200 };
    fetchMock.mockResolvedValueOnce(fakeResponse({
      body: {
        routes: [
          { total_time_seconds: 300, total_distance_meters: 1200, transfers: 0, movements: [movement], cost: { wait: 600 }, explanation: '7B tarda 5 min.' },
          { total_time_seconds: 900, total_distance_meters: 1300, transfers: 0, movements: [], cost: {}, explanation: '' },
        ],
        cost_weights: { wait_weight: 2 },
      },
    }));

    const routes = await fetchRecommendedRoutes(origin, destination, 'balanced');

    expect(routes.map((route) => route.total_time_seconds)).toEqual([300, 900]);
    expect(routes[0]).toMatchObject({ origin_stop_id: 'PAR-CSF-01', destination_stop_id: 'PAR-DPORT-01', wait_seconds: 300, explanation: '7B tarda 5 min.' });
    expect(routes[1].wait_seconds).toBeUndefined();
    expect(routes[0]).not.toHaveProperty('cost');
  });

  it('sin rutas o sin pesos no falla', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { routes: [{ total_time_seconds: 60, total_distance_meters: 80, transfers: 0, movements: [], cost: { wait: 0 } }] } }));
    await expect(fetchRecommendedRoutes(origin, destination, 'fastest')).resolves.toMatchObject([{ wait_seconds: undefined }]);
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: {} }));
    await expect(fetchRecommendedRoutes(origin, destination, 'fastest')).resolves.toEqual([]);
  });

  it('propaga el error del backend con su estado', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 400, body: { error: 'destination stop has no buses' } }));
    await expect(fetchRecommendedRoutes(origin, destination, 'balanced')).rejects.toMatchObject({ status: 400 });
  });
});

describe('fetchWeatherTelemetry', () => {
  it('usa la ruta pública del clima, que reemplazó a /integrations/climate/telemetry', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { data: [] } }));
    await fetchWeatherTelemetry();
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(/\/mapinfo\/climate\/telemetry$/);
  });
});
