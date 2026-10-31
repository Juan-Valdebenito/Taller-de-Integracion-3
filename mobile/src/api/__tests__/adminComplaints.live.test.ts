import { login, logout } from '../../api/authApi';
import { canManage, closesComplaint, initialTarget } from '../../admin/complaintResolution';
import { buildComplaintRows, EMPTY_COMPLAINT_FILTERS, filterComplaints } from '../../admin/complaints';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { fetchAllComplaints, fetchCompanies, fetchComplaintStats } from '../adminApi';
import { fetchCompanyBuses } from '../companyApi';
import { createComplaint, fetchMyComplaints, updateComplaintStatus } from '../complaintsApi';

// Reclamos del administrador contra backend-go real: ve el reclamo de un
// pasajero con su línea, calificación y empresa, lo encuentra con los filtros,
// y lo gestiona hasta resolverlo.

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

  it('el administrador lo pone en revisión y lo resuelve; el pasajero ve la respuesta', async () => {
    await login(SEED_PASSENGER);
    let complaintId: string;
    try {
      const created = await createComplaint({
        title: 'Prueba admin: gestionar',
        description: 'El chofer no paró en el paradero',
        category: 'DRIVER_BEHAVIOR',
        lineName: '1C',
        rating: 1,
        routeId: SEED_ROUTE_ID,
      });
      complaintId = created.id;
    } finally {
      await logout();
    }

    await login(SEED_ADMIN);
    try {
      const before = await fetchComplaintStats();
      expect(canManage('PENDING')).toBe(true);
      const target = initialTarget('PENDING');
      expect(await updateComplaintStatus(complaintId, { status: target, adminResponse: 'Estamos revisando el caso' })).toMatchObject({ status: 'IN_REVIEW' });

      expect(closesComplaint('IN_REVIEW', 'RESOLVED')).toBe(true);
      const resolved = await updateComplaintStatus(complaintId, { status: 'RESOLVED', adminResponse: 'Se amonestó al conductor' });
      expect(resolved).toMatchObject({ status: 'RESOLVED', adminResponse: 'Se amonestó al conductor' });
      expect(canManage(resolved.status)).toBe(false);

      const after = await fetchComplaintStats();
      expect(after.resolved).toBe(before.resolved + 1);
      expect(after.pending).toBe(before.pending - 1);
    } finally {
      await logout();
    }

    await login(SEED_PASSENGER);
    try {
      const mine = (await fetchMyComplaints()).find((c) => c.id === complaintId);
      expect(mine).toMatchObject({ status: 'RESOLVED', adminResponse: 'Se amonestó al conductor' });
    } finally {
      await logout();
    }
  });
});
