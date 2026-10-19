import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { fetchActiveBuses } from '../busesApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const bus = {
  id: 'b1',
  patente: 'ABCD12',
  status: 'ACTIVE',
  capacity: 80,
  lastLatitude: -38.736,
  lastLongitude: -72.59,
  lastSpeed: 32.5,
  lastLocationAt: '2026-10-18T15:00:00Z',
  routeId: 'r1',
};

describe('fetchActiveBuses', () => {
  it('consulta solo las micros activas', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    await fetchActiveBuses();

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/buses$/);
    expect(url.searchParams.get('status')).toBe('ACTIVE');
  });

  it('normaliza la posición de cada micro', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [bus] }));

    await expect(fetchActiveBuses()).resolves.toEqual([
      {
        id: 'b1',
        patente: 'ABCD12',
        latitude: -38.736,
        longitude: -72.59,
        speed: 32.5,
        locationAt: Date.parse('2026-10-18T15:00:00Z'),
        routeId: 'r1',
      },
    ]);
  });

  it('descarta micros sin posición o sin fecha de reporte', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: [
          { ...bus, id: 'sin-posicion', lastLatitude: null, lastLongitude: null },
          { ...bus, id: 'sin-fecha', lastLocationAt: null },
          { ...bus, id: 'fecha-invalida', lastLocationAt: 'ayer' },
          { ...bus, id: 'ok' },
        ],
      }),
    );

    const buses = await fetchActiveBuses();
    expect(buses.map((b) => b.id)).toEqual(['ok']);
  });
});
