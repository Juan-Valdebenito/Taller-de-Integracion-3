import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createCompanyBus, deleteCompanyBus, fetchCompanyBuses } from '../companyApi';
import { createComplaint, fetchCompanyComplaints, fetchMyComplaints, updateComplaintStatus } from '../complaintsApi';

// Empresa contra backend-go real: responder los reclamos que recibe (el pasajero
// ve la respuesta) y dar de baja una micro.

beforeEach(() => {
  resetSecureStore();
});

describeLive('reclamos de empresa en backend-go real', () => {
  it('la empresa ve el reclamo, lo responde y lo cierra; el pasajero ve la respuesta', async () => {
    await login(SEED_PASSENGER);
    let complaintId: string;
    try {
      const created = await createComplaint({
        title: 'Prueba en vivo: reclamo para la empresa',
        description: 'La micro pasó llena y no se detuvo',
        category: 'OVERCROWDING',
        lineName: '7A',
        rating: 2,
        routeId: SEED_ROUTE_ID,
      });
      complaintId = created.id;
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    try {
      const pending = await fetchCompanyComplaints(SEED_COMPANY_ID, { status: 'PENDING' });
      expect(pending.map((c) => c.id)).toContain(complaintId);
      expect(pending.every((c) => c.status === 'PENDING')).toBe(true);

      const inReview = await updateComplaintStatus(complaintId, { status: 'IN_REVIEW', adminResponse: 'Estamos revisando el caso' });
      expect(inReview).toMatchObject({ status: 'IN_REVIEW', adminResponse: 'Estamos revisando el caso' });

      const resolved = await updateComplaintStatus(complaintId, { status: 'RESOLVED', adminResponse: 'Reforzamos la frecuencia en hora punta' });
      expect(resolved.status).toBe('RESOLVED');

      // De "Resuelto" no se puede volver directo a "Pendiente" (sí reabrir a "En revisión").
      await expect(updateComplaintStatus(complaintId, { status: 'PENDING', adminResponse: 'otra vez' })).rejects.toMatchObject({ status: 400 });
    } finally {
      await logout();
    }

    await login(SEED_PASSENGER);
    try {
      const mine = (await fetchMyComplaints()).find((c) => c.id === complaintId);
      expect(mine).toMatchObject({ status: 'RESOLVED', adminResponse: 'Reforzamos la frecuencia en hora punta' });
    } finally {
      await logout();
    }
  });

  it('dar de baja una micro la elimina, y una segunda vez responde 404', async () => {
    await login(SEED_COMPANY);
    try {
      const letters = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26))).join('');
      const bus = await createCompanyBus({ patente: `${letters}-${String(Date.now() % 100).padStart(2, '0')}`, capacity: 30, routeId: null, companyId: SEED_COMPANY_ID });

      await deleteCompanyBus(bus.id);

      expect((await fetchCompanyBuses(SEED_COMPANY_ID)).some((b) => b.id === bus.id)).toBe(false);
      await expect(deleteCompanyBus(bus.id)).rejects.toMatchObject({ status: 404 });
    } finally {
      await logout();
    }
  });
});
