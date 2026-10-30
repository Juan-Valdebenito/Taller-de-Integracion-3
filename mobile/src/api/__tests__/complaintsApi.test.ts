import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { CATEGORY_OPTIONS, categoryLabel, fetchMyComplaints, STATUS_OPTIONS, statusLabel } from '../complaintsApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const complaint = {
  id: 'c1',
  title: 'Micro atrasada',
  description: 'Pasó 20 minutos tarde',
  category: 'DELAY',
  status: 'IN_REVIEW',
  rating: null,
  lineName: null,
  adminResponse: 'Estamos revisando',
  passengerId: 'u1',
  busId: 'b1',
  routeId: null,
  companyId: 'co1',
  tripId: null,
  createdAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T13:00:00Z',
};

describe('fetchMyComplaints', () => {
  it('pide los reclamos del pasajero con su token y sin filtros', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    await fetchMyComplaints();

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/complaints\/my-complaints$/);
    expect(new URL(url).search).toBe('');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('envía los filtros de categoría y estado como el web', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    await fetchMyComplaints({ category: 'OVERCROWDING', status: 'RESOLVED' });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('category')).toBe('OVERCROWDING');
    expect(url.searchParams.get('status')).toBe('RESOLVED');
  });

  it('normaliza cada reclamo y descarta los que no traen id', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [complaint, { title: 'sin id' }, null] }));

    expect(await fetchMyComplaints()).toEqual([
      {
        id: 'c1',
        title: 'Micro atrasada',
        description: 'Pasó 20 minutos tarde',
        category: 'DELAY',
        status: 'IN_REVIEW',
        busId: 'b1',
        routeId: null,
        companyId: 'co1',
        adminResponse: 'Estamos revisando',
        createdAt: '2026-10-29T12:00:00Z',
        updatedAt: '2026-10-29T13:00:00Z',
      },
    ]);
  });

  it('sin reclamos el backend puede responder null: lista vacía', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: null }));
    expect(await fetchMyComplaints()).toEqual([]);
  });

  it('un error del backend llega como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 500, body: { error: 'Error al obtener reclamos' } }));
    await expect(fetchMyComplaints()).rejects.toMatchObject({ name: 'ApiError', status: 500 });
  });
});

describe('textos de reclamos', () => {
  it('categorías y estados con los nombres del web', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.label)).toEqual([
      'Retraso',
      'Exceso de pasajeros',
      'Comportamiento del conductor',
      'Estado del vehículo',
      'Accesibilidad',
      'Otro',
    ]);
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual(['Pendiente', 'En revisión', 'Resuelto', 'Rechazado']);
    expect(categoryLabel('VEHICLE_CONDITION')).toBe('Condición del vehículo');
    expect(statusLabel('IN_REVIEW')).toBe('En revisión');
  });

  it('una categoría o estado desconocido se muestra tal cual', () => {
    expect(categoryLabel('NUEVA')).toBe('NUEVA');
    expect(statusLabel('ARCHIVED')).toBe('ARCHIVED');
  });
});
