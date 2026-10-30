import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { fetchCompanyComplaintStats, fetchRouteStops } from '../companyApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

describe('fetchCompanyComplaintStats', () => {
  it('pide el resumen de reclamos de la empresa y toma los contadores', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: { totalComplaints: 9, pendingCount: 3, inReviewCount: 2, resolvedCount: 4, rejectedCount: 0, averageRating: 2.5, byLine: {} },
      }),
    );

    expect(await fetchCompanyComplaintStats('company demo')).toEqual({ total: 9, pending: 3, inReview: 2, resolved: 4, rejected: 0 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/complaints\/stats$/);
    expect(url.searchParams.get('companyId')).toBe('company demo');
  });

  it('si faltan contadores los toma como cero', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: { pendingCount: 'x' } }));
    expect(await fetchCompanyComplaintStats('co1')).toEqual({ total: 0, pending: 0, inReview: 0, resolved: 0, rejected: 0 });
  });

  it('un error del backend llega como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 500, body: { error: 'Error al calcular estadísticas de reclamos' } }));
    await expect(fetchCompanyComplaintStats('co1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('fetchRouteStops', () => {
  it('trae los paraderos de la ruta en el orden del recorrido', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: [
          { id: 's2', name: 'Plaza', latitude: -38.73, longitude: -72.59, order: 2, routeId: 'r1' },
          { id: 's1', name: ' Terminal ', latitude: -38.7, longitude: -72.55, order: 1, routeId: 'r1' },
          { name: 'sin id', order: 3 },
          { id: 's3', name: '', order: 3 },
        ],
      }),
    );

    const stops = await fetchRouteStops('r 1');

    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(/\/routes\/r%201\/stops$/);
    expect(stops.map((s) => `${s.order}. ${s.name}`)).toEqual(['1. Terminal', '2. Plaza', '3. Paradero sin nombre']);
  });

  it('sin paraderos devuelve una lista vacía', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    expect(await fetchRouteStops('r1')).toEqual([]);
  });
});
