import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_PASSENGER } from '../../test-utils/live/backend';
import { fetchMyComplaints, STATUS_LABELS } from '../complaintsApi';

// "Mis reclamos" contra backend-go real: la ruta, el rol y los filtros que usa la app.

beforeEach(() => {
  resetSecureStore();
});

describeLive('mis reclamos en backend-go real', () => {
  it('el pasajero obtiene sus reclamos, y los filtros devuelven solo lo pedido', async () => {
    await login(SEED_PASSENGER);
    try {
      const all = await fetchMyComplaints();
      expect(Array.isArray(all)).toBe(true);
      for (const complaint of all) {
        expect(complaint.id).toBeTruthy();
        expect(Object.keys(STATUS_LABELS)).toContain(complaint.status);
      }

      for (const status of Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]) {
        const filtered = await fetchMyComplaints({ status });
        expect(filtered.every((c) => c.status === status)).toBe(true);
        expect(filtered.length).toBe(all.filter((c) => c.status === status).length);
      }

      const delays = await fetchMyComplaints({ category: 'DELAY' });
      expect(delays.every((c) => c.category === 'DELAY')).toBe(true);
    } finally {
      await logout();
    }
  });
});
