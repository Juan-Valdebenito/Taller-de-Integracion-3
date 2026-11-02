import { login, logout, register } from '../../api/authApi';
import { formatRut, NEW_COMPANY_FORM, rutCheckDigit, toCompanyInput } from '../../admin/companyForm';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createCompany, createRoute, fetchAllComplaints, fetchComplaintStats } from '../adminApi';
import { apiRequest } from '../client';
import { fetchCompanyComplaintStats } from '../companyApi';
import { createComplaint, fetchCompanyComplaints, updateComplaintStatus } from '../complaintsApi';

// Seguridad de reclamos contra backend-go real: sin sesión no se leen, un
// pasajero solo ve los suyos y cada empresa solo ve y responde los de ella.

beforeEach(() => {
  resetSecureStore();
});

const newComplaint = (title: string, routeId: string) => ({ title, description: `${title}: la micro no se detuvo`, category: 'DELAY' as const, lineName: '7A' as const, rating: 2, routeId });

describeLive('seguridad de reclamos en backend-go real', () => {
  it('sin sesión no se pueden leer ni responder reclamos', async () => {
    await expect(apiRequest('/complaints', { auth: false })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/complaints/stats', { auth: false })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/complaints/cualquiera', { auth: false })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/complaints/cualquiera/status', { method: 'PATCH', auth: false, body: { status: 'RESOLVED' } })).rejects.toMatchObject({ status: 401 });
  });

  it('cada empresa ve y responde solo sus reclamos; el pasajero solo el detalle de los suyos', async () => {
    const suffix = Date.now();
    // Otra empresa con su ruta (la del seed es "Empresa Demo").
    await login(SEED_ADMIN);
    let otherCompanyId: string;
    let otherRouteId: string;
    try {
      const body = String(71_000_000 + (suffix % 1_000_000) * 10);
      const company = await createCompany(
        toCompanyInput({ ...NEW_COMPANY_FORM, name: `Otra Empresa ${suffix}`, rut: formatRut(body + rutCheckDigit(body))!.replace(/\./g, ''), email: `otra-${suffix}@buses.cl` }),
      );
      otherCompanyId = company.id;
      otherRouteId = (await createRoute({ code: `O${suffix % 100000}`, name: 'Ruta de otra empresa', description: null, companyId: company.id })).id;
    } finally {
      await logout();
    }

    // Un pasajero reclama a cada empresa; otra pasajera, a la del seed.
    await login(SEED_PASSENGER);
    let own: string;
    let other: string;
    try {
      own = (await createComplaint(newComplaint(`Seguridad propia ${suffix}`, SEED_ROUTE_ID))).id;
      other = (await createComplaint(newComplaint(`Seguridad otra ${suffix}`, otherRouteId))).id;
      // La lista general y las cifras no son para pasajeros.
      await expect(apiRequest('/complaints')).rejects.toMatchObject({ status: 403 });
      await expect(apiRequest('/complaints/stats')).rejects.toMatchObject({ status: 403 });
      await expect(apiRequest(`/complaints/${own}`)).resolves.toMatchObject({ id: own });
    } finally {
      await logout();
    }
    await register({ name: 'Pasajera Curiosa', email: `curiosa.${suffix}@example.com`, password: 'Password123!' });
    try {
      // Un reclamo ajeno responde como si no existiera.
      await expect(apiRequest(`/complaints/${own}`)).rejects.toMatchObject({ status: 404 });
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    try {
      // Aunque pida los de la otra empresa, recibe solo los suyos.
      const asked = await fetchCompanyComplaints(otherCompanyId);
      expect(asked.map((c) => c.id)).toContain(own);
      expect(asked.map((c) => c.id)).not.toContain(other);
      expect(asked.every((c) => c.companyId === SEED_COMPANY_ID)).toBe(true);
      const all = await apiRequest<Array<{ id: string; companyId: string }>>('/complaints');
      expect(all.every((c) => c.companyId === SEED_COMPANY_ID)).toBe(true);

      // Las cifras también son las de su empresa.
      const mine = await fetchCompanyComplaintStats(SEED_COMPANY_ID);
      await expect(fetchCompanyComplaintStats(otherCompanyId)).resolves.toEqual(mine);

      await expect(apiRequest(`/complaints/${other}`)).rejects.toMatchObject({ status: 404 });
      await expect(updateComplaintStatus(other, { status: 'REJECTED', adminResponse: 'No es nuestro' })).rejects.toMatchObject({ status: 404 });
      await expect(updateComplaintStatus(own, { status: 'IN_REVIEW', adminResponse: 'Lo revisamos' })).resolves.toMatchObject({ status: 'IN_REVIEW' });
    } finally {
      await logout();
    }

    // El administrador sigue viendo todo, y el reclamo de la otra empresa sigue pendiente.
    await login(SEED_ADMIN);
    try {
      const all = await fetchAllComplaints();
      expect(all.find((c) => c.id === other)).toMatchObject({ companyId: otherCompanyId, status: 'PENDING' });
      expect(all.some((c) => c.id === own)).toBe(true);
      expect((await fetchComplaintStats(otherCompanyId)).total).toBe(1);
    } finally {
      await logout();
    }
  });

  it('una cuenta de empresa sin empresa asignada no ve reclamos', async () => {
    const suffix = Date.now();
    await register({ name: 'Empresa Sin Asignar', email: `sinasignar.${suffix}@example.com`, password: 'Password123!', role: 'COMPANY' });
    try {
      await expect(apiRequest('/complaints')).rejects.toMatchObject({ status: 403, message: expect.stringContaining('no tiene una empresa asignada') });
      await expect(apiRequest('/complaints/stats')).rejects.toMatchObject({ status: 403 });
    } finally {
      await logout();
    }
  });
});
