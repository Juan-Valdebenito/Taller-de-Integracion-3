import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_COMPANY_ID, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createCompanyBus, fetchCompanyBuses, saveCompanyBus, updateCompanyBus } from '../companyApi';

// Flota de la empresa contra backend-go real: registrar y editar una micro
// con los mismos datos que envía el formulario de la app.

beforeEach(() => {
  resetSecureStore();
});

/** Patente válida y distinta en cada corrida: 4 letras + 2 números. */
function uniquePlate(): string {
  const letters = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26))).join('');
  return `${letters}-${String(Date.now() % 100).padStart(2, '0')}`;
}

describeLive('flota de micros en backend-go real', () => {
  it('registra una micro en la empresa y luego edita sus datos y estado', async () => {
    await login(SEED_COMPANY);
    try {
      const patente = uniquePlate();
      const created = await createCompanyBus({ patente, capacity: 42, routeId: null, companyId: SEED_COMPANY_ID });
      expect(created).toMatchObject({ patente, capacity: 42, status: 'INACTIVE', companyId: SEED_COMPANY_ID });

      // El formulario pidió "En Servicio": se aplica tras crearla.
      await updateCompanyBus(created.id, { status: 'ACTIVE' });
      await saveCompanyBus(created.id, { patente, capacity: 38, routeId: SEED_ROUTE_ID, status: 'MAINTENANCE' });

      const saved = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((bus) => bus.id === created.id);
      expect(saved).toMatchObject({ patente, capacity: 38, routeId: SEED_ROUTE_ID, status: 'MAINTENANCE' });

      // Volver a "sin ruta" también se guarda.
      await saveCompanyBus(created.id, { patente, capacity: 38, routeId: null, status: 'INACTIVE' });
      const cleared = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((bus) => bus.id === created.id);
      expect(cleared?.routeId ?? null).toBeNull();
    } finally {
      await logout();
    }
  });

  it('el backend rechaza una patente con formato inválido', async () => {
    await login(SEED_COMPANY);
    try {
      await expect(createCompanyBus({ patente: 'A1B2C3', capacity: 30, routeId: null, companyId: SEED_COMPANY_ID })).rejects.toMatchObject({
        status: 400,
      });
    } finally {
      await logout();
    }
  });
});
