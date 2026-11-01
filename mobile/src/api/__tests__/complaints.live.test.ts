import { login, logout } from '../../api/authApi';
import { apiRequest } from '../../api/client';
import { describeLive, resetSecureStore, SEED_PASSENGER } from '../../test-utils/live/backend';
import { createComplaint, fetchComplaintOptions, fetchMyComplaints, STATUS_LABELS, uploadComplaintPhoto } from '../complaintsApi';
import { TINY_JPEGS } from '../../test-utils/live/images';

// Reclamos contra backend-go real: "mis reclamos" con sus filtros, crear un
// reclamo y adjuntarle fotos (las que deja el backend: máximo 3).

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

describeLive('crear un reclamo con fotos en backend-go real', () => {
  it('crea el reclamo, aparece primero en "mis reclamos" y acepta hasta 3 fotos', async () => {
    // La foto va como data: URI, igual que en la versión web (se envía como archivo).
    await login(SEED_PASSENGER);
    try {
      const { routes } = await fetchComplaintOptions();
      expect(routes.length).toBeGreaterThan(0);

      const created = await createComplaint({
        title: 'Prueba en vivo de la app',
        description: 'Reclamo creado por la prueba en vivo de la app móvil',
        category: 'OTHER',
        lineName: '7A',
        rating: 3,
        routeId: routes[0].id,
      });
      expect(created).toMatchObject({ status: 'PENDING', routeId: routes[0].id, category: 'OTHER' });
      expect((await fetchMyComplaints())[0].id).toBe(created.id);

      const photo = (i: number) => ({ uri: TINY_JPEGS[i], name: `foto-reclamo-${i + 1}.jpg`, mimeType: 'image/jpeg' as const });
      for (let i = 0; i < 3; i++) await uploadComplaintPhoto(created.id, photo(i));
      const attachments = await apiRequest<Array<{ mimeType: string }>>(`/complaints/${created.id}/attachments`);
      expect(attachments).toHaveLength(3);
      expect(attachments.every((a) => a.mimeType === 'image/jpeg')).toBe(true);

      // La misma foto otra vez, o una cuarta, las rechaza el backend con su mensaje.
      await expect(uploadComplaintPhoto(created.id, photo(0))).rejects.toMatchObject({ message: expect.any(String) });
      await expect(uploadComplaintPhoto(created.id, photo(3))).rejects.toMatchObject({
        message: 'el reclamo ya tiene el máximo de 3 imágenes',
      });
    } finally {
      await logout();
    }
  });
});
