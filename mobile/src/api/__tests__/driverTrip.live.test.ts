import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_COMPANY_ID, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchCompanyBuses, updateCompanyBus } from '../companyApi';

// Modo conductor contra backend-go real: iniciar un recorrido pone la micro
// ACTIVE con su ruta, y finalizarlo la deja INACTIVE (lo que hace useDriverTrip).

beforeEach(() => {
  resetSecureStore();
});

describeLive('recorrido del modo conductor en backend-go real', () => {
  it('iniciar y finalizar cambian el estado de la micro en el backend', async () => {
    await login(SEED_COMPANY);
    try {
      const buses = await fetchCompanyBuses(SEED_COMPANY_ID);
      const bus = buses.find((b) => b.companyId === SEED_COMPANY_ID && (b.status === 'INACTIVE' || b.status === 'ACTIVE'));
      expect(bus).toBeDefined();

      await updateCompanyBus(bus!.id, { status: 'ACTIVE', routeId: SEED_ROUTE_ID });
      const started = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.id === bus!.id);
      expect(started).toMatchObject({ status: 'ACTIVE', routeId: SEED_ROUTE_ID });

      await updateCompanyBus(bus!.id, { status: 'INACTIVE' });
      const stopped = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.id === bus!.id);
      expect(stopped?.status).toBe('INACTIVE');
    } finally {
      await logout();
    }
  });
});
