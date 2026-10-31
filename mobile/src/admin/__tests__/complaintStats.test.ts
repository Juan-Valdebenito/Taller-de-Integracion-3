import * as SecureStore from 'expo-secure-store';

import { fetchComplaintStats } from '../../api/adminApi';
import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { adminCategory, breakdown, filledStars, formatPercent, formatRating } from '../complaintStats';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

describe('fetchComplaintStats', () => {
  it('pide las estadísticas de toda la plataforma y ordena los datos', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        body: {
          totalComplaints: 12,
          averageRating: 3.4,
          csat: 3.4,
          resolvedPercentage: 41.67,
          pendingCount: 4,
          inReviewCount: 2,
          resolvedCount: 5,
          rejectedCount: 1,
          byCategory: { DELAY: 5, OVERCROWDING: 7, OTHER: 0 },
          byLine: { '7A': 8, '1C': 4 },
          byStatus: {},
        },
      }),
    );

    expect(await fetchComplaintStats()).toEqual({
      total: 12,
      averageRating: 3.4,
      resolvedPercentage: 41.67,
      pending: 4,
      inReview: 2,
      resolved: 5,
      rejected: 1,
      byCategory: { DELAY: 5, OVERCROWDING: 7 },
      byLine: { '7A': 8, '1C': 4 },
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/complaints\/stats$/);
    expect(url.search).toBe('');
  });

  it('puede pedir las de una empresa, y sin datos todo queda en cero', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: null }));
    expect(await fetchComplaintStats('company demo')).toMatchObject({ total: 0, averageRating: 0, byCategory: {}, byLine: {} });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('companyId')).toBe('company demo');
  });
});

describe('panel de reclamos', () => {
  it('nombra las categorías como el panel del web', () => {
    expect(adminCategory('OVERCROWDING')).toEqual({ label: 'Sobrecupo / Aforo', icon: '⚠️' });
    expect(adminCategory('FARES_PAYMENT').label).toBe('Pago Tarifa / Bipay');
    expect(adminCategory('NUEVA')).toEqual({ label: 'NUEVA', icon: '📌' });
  });

  it('ordena la distribución de mayor a menor con su porcentaje', () => {
    expect(breakdown({ DELAY: 5, OVERCROWDING: 7, OTHER: 0, ACCESSIBILITY: 5 })).toEqual([
      { key: 'OVERCROWDING', count: 7, percent: 41 },
      { key: 'ACCESSIBILITY', count: 5, percent: 29 },
      { key: 'DELAY', count: 5, percent: 29 },
    ]);
    expect(breakdown({})).toEqual([]);
  });

  it('formatea calificación, porcentaje y estrellas como el web', () => {
    expect(formatRating(3.44)).toBe('3.4');
    expect(formatPercent(41.666)).toBe('41.7%');
    expect([filledStars(0), filledStars(3.5), filledStars(4.4), filledStars(7)]).toEqual([0, 4, 4, 5]);
  });
});
