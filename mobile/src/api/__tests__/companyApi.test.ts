import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { fetchCompanyComplaintStats } from '../companyApi';

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
