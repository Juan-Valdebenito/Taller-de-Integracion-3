import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { fetchNearbyStops } from '../stopsApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const query = { latitude: -38.7359123, longitude: -72.5904456, radiusMeters: 1000 };

describe('fetchNearbyStops', () => {
  it('consulta los paraderos oficiales cercanos con lat, long y radio, autenticado', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { stops: [], total: 0 } }));

    await fetchNearbyStops(query);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/integrations\/micro\/stops$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: '-38.735912', long: '-72.590446', radius_m: '1000', limit: '50' });
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
  });

  it('devuelve los paraderos normalizados', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: {
          stops: [
            { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 },
            { id: 'p2', name: '  Av. Alemania  ', latitude: -38.7341, longitude: -72.6043 },
          ],
          total: 2,
        },
      }),
    );

    await expect(fetchNearbyStops(query)).resolves.toEqual([
      { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 },
      { id: 'p2', name: 'Av. Alemania', latitude: -38.7341, longitude: -72.6043 },
    ]);
  });

  it('sin resultados el backend responde {} (omitempty): devuelve lista vacía', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: {} }));
    await expect(fetchNearbyStops(query)).resolves.toEqual([]);
  });

  it('descarta paraderos sin id o sin coordenadas', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: {
          stops: [
            { name: 'Sin id', latitude: -38.7, longitude: -72.6 },
            { id: 'sin-coords', name: 'Sin coordenadas' },
            { id: 'ok', latitude: -38.7, longitude: -72.6 },
          ],
        },
      }),
    );

    await expect(fetchNearbyStops(query)).resolves.toEqual([
      { id: 'ok', name: 'Paradero sin nombre', latitude: -38.7, longitude: -72.6 },
    ]);
  });

  it('propaga el error del backend (ej. microservicio caído)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 503, body: { error: 'micro service unavailable' } }));
    await expect(fetchNearbyStops(query)).rejects.toMatchObject({ status: 503 });
  });
});
