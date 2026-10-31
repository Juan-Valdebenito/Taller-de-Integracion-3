import * as SecureStore from 'expo-secure-store';

import { fetchCompanies, fetchPendingComplaintsByCompany } from '../../api/adminApi';
import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { saveTokens } from '../../storage/tokenStorage';
import { fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { buildCompanyCards, filterCompanies } from '../companies';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const bus = (id: string, companyId: string, status: CompanyBus['status'] = 'INACTIVE'): CompanyBus => ({
  id,
  patente: id,
  capacity: 40,
  currentPassengers: 0,
  status,
  companyId,
});
const route = (id: string, companyId: string): CompanyRoute => ({ id, code: id, name: id, isActive: true, companyId });

describe('consultas de empresas', () => {
  it('trae las empresas (solo las que entrega el backend: id, nombre y estado)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [{ id: 'co1', name: ' Buses Sur ', isActive: true }, { name: 'sin id' }, { id: 'co2', name: '' }] }));

    expect(await fetchCompanies()).toEqual([
      { id: 'co1', name: 'Buses Sur', isActive: true },
      { id: 'co2', name: 'Empresa sin nombre', isActive: true },
    ]);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(/\/companies$/);
  });

  it('cuenta los reclamos pendientes por empresa con una sola consulta', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [{ companyId: 'co1' }, { companyId: 'co1' }, { companyId: 'co2' }, { companyId: null }] }));

    expect(await fetchPendingComplaintsByCompany()).toEqual({ co1: 2, co2: 1 });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('status')).toBe('PENDING');
  });
});

describe('tarjetas de empresas', () => {
  const cards = buildCompanyCards(
    [
      { id: 'co1', name: 'Buses Ñielol', isActive: true },
      { id: 'co2', name: 'Trans Sur', isActive: false },
    ],
    [bus('b1', 'co1', 'ACTIVE'), bus('b2', 'co1'), bus('b3', 'co2')],
    [route('r1', 'co1'), route('r2', 'co2'), route('r3', 'co2')],
    { co1: 3 },
  );

  it('calcula micros, rutas y reclamos pendientes de cada empresa', () => {
    expect(cards).toEqual([
      { id: 'co1', name: 'Buses Ñielol', isActive: true, buses: 2, activeBuses: 1, routes: 1, pendingComplaints: 3 },
      { id: 'co2', name: 'Trans Sur', isActive: false, buses: 1, activeBuses: 0, routes: 2, pendingComplaints: 0 },
    ]);
  });

  it('busca por nombre sin importar mayúsculas ni tildes, y filtra por estado', () => {
    expect(filterCompanies(cards, 'nielol', 'ALL').map((c) => c.id)).toEqual(['co1']);
    expect(filterCompanies(cards, 'CO2', 'ALL').map((c) => c.id)).toEqual(['co2']);
    expect(filterCompanies(cards, '', 'active').map((c) => c.id)).toEqual(['co1']);
    expect(filterCompanies(cards, '', 'inactive').map((c) => c.id)).toEqual(['co2']);
  });
});
