import { getCurrentUser, login, logout } from '../../api/authApi';
import { computeDashboardStats } from '../../company/dashboardStats';
import {
  describeLive,
  resetSecureStore,
  SEED_COMPANY,
  SEED_COMPANY_ID,
  SEED_PASSENGER,
  SEED_ROUTE_ID,
} from '../../test-utils/live/backend';
import { fetchCompanyBuses, fetchCompanyComplaintStats, fetchCompanyRoutes } from '../companyApi';
import { createComplaint } from '../complaintsApi';

// Dashboard de empresa contra backend-go real: los datos de la empresa del
// seed y que un reclamo nuevo de un pasajero suba sus pendientes.

beforeEach(() => {
  resetSecureStore();
});

describeLive('dashboard de empresa en backend-go real', () => {
  it('la empresa ve sus micros y rutas, y un reclamo nuevo suma a sus pendientes', async () => {
    await login(SEED_COMPANY);
    let pendingBefore: number;
    try {
      const me = await getCurrentUser();
      expect(me).toMatchObject({ role: 'COMPANY', companyId: SEED_COMPANY_ID });

      const [buses, routes] = await Promise.all([fetchCompanyBuses(SEED_COMPANY_ID), fetchCompanyRoutes()]);
      const ownRoutes = routes.filter((route) => route.companyId === SEED_COMPANY_ID);
      expect(ownRoutes.map((route) => route.id)).toContain(SEED_ROUTE_ID);
      const stats = computeDashboardStats(
        buses.filter((bus) => bus.companyId === SEED_COMPANY_ID),
        ownRoutes,
        null,
      );
      expect(stats.totalBuses).toBeGreaterThan(0);
      expect(stats.activeRoutes).toBeGreaterThan(0);

      pendingBefore = (await fetchCompanyComplaintStats(SEED_COMPANY_ID)).pending;
    } finally {
      await logout();
    }

    // Un pasajero reclama por la ruta de la empresa.
    await login(SEED_PASSENGER);
    try {
      await createComplaint({
        title: 'Prueba en vivo del dashboard',
        description: 'Reclamo para comprobar los pendientes de la empresa',
        category: 'DELAY',
        lineName: '7A',
        rating: 2,
        routeId: SEED_ROUTE_ID,
      });
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    try {
      expect((await fetchCompanyComplaintStats(SEED_COMPANY_ID)).pending).toBe(pendingBefore + 1);
    } finally {
      await logout();
    }
  });
});
