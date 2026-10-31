import { login, logout } from '../../api/authApi';
import { buildRouteRows } from '../../admin/routes';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY_ID, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchCompanies } from '../adminApi';
import { apiRequest } from '../client';
import { fetchCompanyBuses, fetchCompanyRoutes, fetchRouteStops } from '../companyApi';

// Rutas del administrador contra backend-go real: la ruta del seed con el
// nombre de su empresa, sus micros y su recorrido de paraderos.

beforeEach(() => {
  resetSecureStore();
});

describeLive('rutas del administrador en backend-go real', () => {
  it('lista la ruta del seed con su empresa y micros, y muestra sus paraderos en orden', async () => {
    const suffix = Date.now();
    await login(SEED_ADMIN);
    try {
      const [routes, buses, companies] = await Promise.all([fetchCompanyRoutes(), fetchCompanyBuses(), fetchCompanies()]);
      const row = buildRouteRows(routes, buses, companies).find((r) => r.id === SEED_ROUTE_ID);
      expect(row).toMatchObject({ code: 'L1-DEMO', companyId: SEED_COMPANY_ID, companyName: 'Empresa Demo' });
      expect(row!.buses.length).toBeGreaterThan(0);

      await apiRequest(`/routes/${SEED_ROUTE_ID}/stops`, { method: 'POST', body: { name: `Final ${suffix}`, latitude: -38.7345, longitude: -72.6118, order: 99 } });
      await apiRequest(`/routes/${SEED_ROUTE_ID}/stops`, { method: 'POST', body: { name: `Inicio ${suffix}`, latitude: -38.704, longitude: -72.5505, order: 0 } });
      const stops = (await fetchRouteStops(SEED_ROUTE_ID)).filter((s) => s.name.endsWith(String(suffix)));
      expect(stops.map((s) => s.name)).toEqual([`Inicio ${suffix}`, `Final ${suffix}`]);
    } finally {
      await logout();
    }
  });
});
