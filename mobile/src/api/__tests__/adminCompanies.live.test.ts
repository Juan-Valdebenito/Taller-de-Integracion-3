import { login, logout } from '../../api/authApi';
import { buildCompanyCards } from '../../admin/companies';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchCompanies, fetchPendingComplaintsByCompany } from '../adminApi';
import { fetchCompanyBuses, fetchCompanyRoutes } from '../companyApi';
import { createComplaint } from '../complaintsApi';

// Empresas del administrador contra backend-go real: la empresa del seed con sus
// micros y rutas, y que un reclamo nuevo sume a sus pendientes.

beforeEach(() => {
  resetSecureStore();
});

async function adminCards() {
  await login(SEED_ADMIN);
  try {
    const [companies, buses, routes, pending] = await Promise.all([
      fetchCompanies(),
      fetchCompanyBuses(),
      fetchCompanyRoutes(),
      fetchPendingComplaintsByCompany(),
    ]);
    return buildCompanyCards(companies, buses, routes, pending);
  } finally {
    await logout();
  }
}

describeLive('empresas del administrador en backend-go real', () => {
  it('lista la empresa del seed con su micro y su ruta, y un reclamo nuevo suma a sus pendientes', async () => {
    const before = (await adminCards()).find((card) => card.id === SEED_COMPANY_ID);
    expect(before).toMatchObject({ name: 'Empresa Demo', isActive: true });
    expect(before!.buses).toBeGreaterThan(0);
    expect(before!.routes).toBeGreaterThan(0);

    await login(SEED_PASSENGER);
    try {
      await createComplaint({
        title: 'Prueba en vivo de empresas',
        description: 'Reclamo para los pendientes de la empresa',
        category: 'DELAY',
        lineName: '7B',
        rating: 2,
        routeId: SEED_ROUTE_ID,
      });
    } finally {
      await logout();
    }

    const after = (await adminCards()).find((card) => card.id === SEED_COMPANY_ID);
    expect(after!.pendingComplaints).toBe(before!.pendingComplaints + 1);
  });

  it('una cuenta de empresa no puede listar las empresas (solo ADMIN)', async () => {
    await login(SEED_COMPANY);
    try {
      await expect(fetchCompanies()).rejects.toMatchObject({ status: 403 });
    } finally {
      await logout();
    }
  });
});
