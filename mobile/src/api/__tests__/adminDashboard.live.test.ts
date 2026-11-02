import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchComplaintStats } from '../adminApi';
import { createComplaint } from '../complaintsApi';

// Dashboard del administrador contra backend-go real: un reclamo nuevo suma al
// total, a los pendientes, a su categoría y a su línea.

beforeEach(() => {
  resetSecureStore();
});

describeLive('dashboard del administrador en backend-go real', () => {
  it('las estadísticas de toda la plataforma reflejan un reclamo nuevo', async () => {
    await login(SEED_ADMIN);
    const before = await fetchComplaintStats().finally(() => logout());

    await login(SEED_PASSENGER);
    try {
      await createComplaint({
        title: 'Prueba en vivo del dashboard admin',
        description: 'Reclamo para comprobar las estadísticas',
        category: 'ACCESSIBILITY',
        lineName: '1C',
        rating: 4,
        routeId: SEED_ROUTE_ID,
      });
    } finally {
      await logout();
    }

    await login(SEED_ADMIN);
    try {
      const after = await fetchComplaintStats();
      expect(after.total).toBe(before.total + 1);
      expect(after.pending).toBe(before.pending + 1);
      expect(after.byCategory.ACCESSIBILITY ?? 0).toBe((before.byCategory.ACCESSIBILITY ?? 0) + 1);
      expect(after.byLine['1C'] ?? 0).toBe((before.byLine['1C'] ?? 0) + 1);
      expect(after.averageRating).toBeGreaterThan(0);
    } finally {
      await logout();
    }
  });
});
