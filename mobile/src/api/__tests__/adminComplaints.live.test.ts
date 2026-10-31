import { login, logout } from '../../api/authApi';
import { buildComplaintRows, EMPTY_COMPLAINT_FILTERS, filterComplaints } from '../../admin/complaints';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchAllComplaints, fetchCompanies, fetchComplaintStats } from '../adminApi';
import { fetchCompanyBuses } from '../companyApi';
import { createComplaint } from '../complaintsApi';

// Reclamos del administrador contra backend-go real: ve el reclamo de un
// pasajero con su línea, calificación y empresa, y lo encuentra con los filtros.

beforeEach(() => {
  resetSecureStore();
});

describeLive('reclamos del administrador en backend-go real', () => {
  it('lista el reclamo de un pasajero con línea, calificación y empresa, y lo filtra', async () => {
    const suffix = Date.now();
    await login(SEED_PASSENGER);
    let complaintId: string;
    try {
      const created = await createComplaint({
        title: `Prueba admin ${suffix}`,
        description: `La micro no se detuvo en el paradero ${suffix}`,
        category: 'DELAY',
        lineName: '7B',
        rating: 3,
        routeId: SEED_ROUTE_ID,
      });
      complaintId = created.id;
    } finally {
      await logout();
    }

    await login(SEED_ADMIN);
    try {
      const [list, stats, companies, buses] = await Promise.all([fetchAllComplaints(), fetchComplaintStats(), fetchCompanies(), fetchCompanyBuses()]);
      const rows = buildComplaintRows(list, companies, buses);
      const row = rows.find((r) => r.id === complaintId);
      expect(row).toMatchObject({ status: 'PENDING', category: 'DELAY', lineName: '7B', rating: 3, companyId: SEED_COMPANY_ID, companyName: 'Empresa Demo' });
      expect(row!.date).toMatch(/^\d{1,2} de [a-z]+ de \d{4}$/);
      expect(stats.total).toBe(list.length);

      const find = (filters: Partial<typeof EMPTY_COMPLAINT_FILTERS>) =>
        filterComplaints(rows, { ...EMPTY_COMPLAINT_FILTERS, ...filters }).some((r) => r.id === complaintId);
      expect(find({ line: '7B', status: 'PENDING', category: 'DELAY', search: String(suffix) })).toBe(true);
      expect(find({ line: '7A' })).toBe(false);
      expect(find({ status: 'RESOLVED' })).toBe(false);
    } finally {
      await logout();
    }
  });
});
