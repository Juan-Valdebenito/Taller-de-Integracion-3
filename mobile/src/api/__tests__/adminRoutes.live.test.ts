import { login, logout } from '../../api/authApi';
import { formFromRoute, newRouteForm, toNewRouteInput, toRouteUpdateInput, validateRouteForm } from '../../admin/routeForm';
import { buildRouteRows } from '../../admin/routes';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY_ID, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createRoute, deleteRoute, fetchCompanies, updateRoute } from '../adminApi';
import { apiRequest } from '../client';
import { fetchCompanyBuses, fetchCompanyRoutes, fetchRouteStops } from '../companyApi';

// Rutas del administrador contra backend-go real: la ruta del seed con el
// nombre de su empresa, sus micros y su recorrido de paraderos, y la gestión
// completa de una ruta nueva.

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

  it('crea, edita, desactiva y elimina una ruta con las funciones de la app', async () => {
    const code = `T${Date.now() % 1_000_000}`;
    await login(SEED_ADMIN);
    try {
      const form = { ...newRouteForm(SEED_COMPANY_ID), code, name: 'Ruta de prueba', description: 'Creada por el test' };
      expect(validateRouteForm(form, await fetchCompanyRoutes(), null)).toBeNull();
      const created = await createRoute(toNewRouteInput(form));
      expect(created).toMatchObject({ code, name: 'Ruta de prueba', description: 'Creada por el test', isActive: true, companyId: SEED_COMPANY_ID });

      // El código repetido lo frena la app: backend-go respondería un 500 genérico.
      expect(validateRouteForm({ ...form, code: code.toLowerCase() }, await fetchCompanyRoutes(), null)).toBe(`Ya existe una ruta con el código ${code.toLowerCase()}`);

      const edited = await updateRoute(created.id, toRouteUpdateInput({ ...formFromRoute(created), name: 'Ruta editada', description: '', isActive: false }));
      expect(edited).toMatchObject({ id: created.id, name: 'Ruta editada', isActive: false, companyId: SEED_COMPANY_ID });
      expect(edited.description ?? null).toBeNull();

      await apiRequest(`/routes/${created.id}/stops`, { method: 'POST', body: { name: 'Paradero de prueba', latitude: -38.73, longitude: -72.6, order: 1 } });
      expect(await fetchRouteStops(created.id)).toHaveLength(1);

      await deleteRoute(created.id);
      expect((await fetchCompanyRoutes()).some((route) => route.id === created.id)).toBe(false);
      // Sus paraderos se borran con ella.
      await expect(fetchRouteStops(created.id)).resolves.toEqual([]);
    } finally {
      await logout();
    }
  });
});
