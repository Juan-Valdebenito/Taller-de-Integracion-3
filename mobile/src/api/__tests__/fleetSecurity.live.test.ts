import { login, logout } from '../../api/authApi';
import { formatRut, NEW_COMPANY_FORM, rutCheckDigit, toCompanyInput } from '../../admin/companyForm';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createCompany, createRoute, updateRoute } from '../adminApi';
import { apiRequest } from '../client';
import { createCompanyBus, deleteCompanyBus, fetchCompanyRoutes, saveCompanyBus, updateCompanyBus, type CompanyBus } from '../companyApi';

// Micros y rutas por empresa contra backend-go real: una empresa solo crea,
// edita y elimina las suyas, y solo les asigna rutas propias.

beforeEach(() => {
  resetSecureStore();
});

/** Patente válida (ABCD-12) distinta en cada llamada. */
let plateSeed = Date.now();
function newPlate(): string {
  plateSeed += 1;
  const letters = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(plateSeed / 26 ** i) % 26))).join('');
  return `${letters}-${String(plateSeed % 100).padStart(2, '0')}`;
}

describeLive('micros y rutas por empresa en backend-go real', () => {
  it('una empresa no puede tocar micros ni rutas de otra, ni asignarle a las suyas rutas ajenas', async () => {
    const suffix = Date.now();
    // Otra empresa con una ruta y una micro (las crea el administrador).
    await login(SEED_ADMIN);
    let otherCompanyId: string;
    let otherRouteId: string;
    let otherBus: CompanyBus;
    try {
      const body = String(72_000_000 + (suffix % 1_000_000) * 10);
      otherCompanyId = (
        await createCompany(toCompanyInput({ ...NEW_COMPANY_FORM, name: `Flota Ajena ${suffix}`, rut: formatRut(body + rutCheckDigit(body))!.replace(/\./g, ''), email: `flota-${suffix}@buses.cl` }))
      ).id;
      otherRouteId = (await createRoute({ code: `F${suffix % 100000}`, name: 'Ruta ajena', description: null, companyId: otherCompanyId })).id;
      otherBus = await createCompanyBus({ patente: newPlate(), capacity: 30, routeId: otherRouteId, companyId: otherCompanyId });
      expect(otherBus.companyId).toBe(otherCompanyId);
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    let ownBusId: string | null = null;
    try {
      // Aunque pida crearla para la otra empresa, la micro queda en la suya.
      const own = await createCompanyBus({ patente: newPlate(), capacity: 40, routeId: null, companyId: otherCompanyId });
      ownBusId = own.id;
      expect(own.companyId).toBe(SEED_COMPANY_ID);

      // No puede asignarle una ruta de otra empresa (ni al crearla ni después).
      await expect(createCompanyBus({ patente: newPlate(), capacity: 40, routeId: otherRouteId, companyId: SEED_COMPANY_ID })).rejects.toMatchObject({ status: 400 });
      await expect(updateCompanyBus(own.id, { routeId: otherRouteId })).rejects.toMatchObject({ status: 400 });
      await expect(saveCompanyBus(own.id, { patente: own.patente, capacity: 40, routeId: otherRouteId, status: 'ACTIVE' })).rejects.toMatchObject({ status: 400 });
      // Su propia ruta sí.
      await expect(updateCompanyBus(own.id, { routeId: SEED_ROUTE_ID })).resolves.toMatchObject({ routeId: SEED_ROUTE_ID });

      // La micro de la otra empresa responde como si no existiera.
      await expect(updateCompanyBus(otherBus.id, { status: 'MAINTENANCE' })).rejects.toMatchObject({ status: 404 });
      await expect(saveCompanyBus(otherBus.id, { patente: otherBus.patente, capacity: 30, routeId: null, status: 'ACTIVE' })).rejects.toMatchObject({ status: 404 });
      await expect(deleteCompanyBus(otherBus.id)).rejects.toMatchObject({ status: 404 });

      // Rutas: no puede editar la de otra empresa; la suya sí.
      await expect(updateRoute(otherRouteId, { code: 'HACK', name: 'Ruta tomada', description: null, isActive: false })).rejects.toMatchObject({ status: 404 });
      const mine = (await fetchCompanyRoutes()).find((r) => r.id === SEED_ROUTE_ID)!;
      await expect(updateRoute(mine.id, { code: mine.code, name: mine.name, description: mine.description ?? null, isActive: mine.isActive })).resolves.toMatchObject({ id: SEED_ROUTE_ID });
    } finally {
      if (ownBusId) await deleteCompanyBus(ownBusId).catch(() => undefined);
      await logout();
    }

    // Nada de la otra empresa cambió.
    await login(SEED_ADMIN);
    try {
      const bus = await apiRequest<CompanyBus>(`/buses/${otherBus.id}`);
      expect(bus).toMatchObject({ status: otherBus.status, routeId: otherRouteId, companyId: otherCompanyId });
      const route = (await fetchCompanyRoutes()).find((r) => r.id === otherRouteId);
      expect(route).toMatchObject({ name: 'Ruta ajena', isActive: true });
    } finally {
      await logout();
    }
  });
});
