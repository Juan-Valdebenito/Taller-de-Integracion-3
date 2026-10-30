import { login, logout } from '../../api/authApi';
import { apiRequest } from '../../api/client';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchRouteStops } from '../companyApi';

// Rutas de empresa contra backend-go real: el administrador crea paraderos en
// la ruta del seed y la empresa los ve en el orden del recorrido.

beforeEach(() => {
  resetSecureStore();
});

describeLive('paraderos de una ruta en backend-go real', () => {
  it('la empresa ve los paraderos de su ruta ordenados por recorrido', async () => {
    const suffix = Date.now();
    await login(SEED_ADMIN);
    try {
      // Se crean en desorden: primero el 2 y luego el 1.
      for (const [order, name, latitude, longitude] of [
        [2, `Plaza de Armas ${suffix}`, -38.7359, -72.5904],
        [1, `Terminal Campus ${suffix}`, -38.7039, -72.5505],
      ] as const) {
        await apiRequest(`/routes/${SEED_ROUTE_ID}/stops`, { method: 'POST', body: { name, latitude, longitude, order } });
      }
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    try {
      const stops = (await fetchRouteStops(SEED_ROUTE_ID)).filter((stop) => stop.name.endsWith(String(suffix)));
      expect(stops.map((stop) => stop.name)).toEqual([`Terminal Campus ${suffix}`, `Plaza de Armas ${suffix}`]);
      expect(stops[0]).toMatchObject({ latitude: -38.7039, longitude: -72.5505, order: 1 });
    } finally {
      await logout();
    }
  });
});
