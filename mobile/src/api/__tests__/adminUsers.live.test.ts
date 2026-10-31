import { login, logout } from '../../api/authApi';
import { buildUserRows, countUsers } from '../../admin/users';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER } from '../../test-utils/live/backend';
import { fetchCompanies, fetchUsers } from '../adminApi';

// Usuarios del administrador contra backend-go real: las cuentas del seed con
// su rol, su estado y el nombre de su empresa.

beforeEach(() => {
  resetSecureStore();
});

describeLive('usuarios del administrador en backend-go real', () => {
  it('lista las cuentas del seed con su rol y empresa, sin exponer contraseñas', async () => {
    await login(SEED_ADMIN);
    try {
      const [users, companies] = await Promise.all([fetchUsers(), fetchCompanies()]);
      const rows = buildUserRows(users, companies);
      const byEmail = (email: string) => rows.find((row) => row.email === email);

      expect(byEmail(SEED_ADMIN.email)).toMatchObject({ role: 'ADMIN', isActive: true, companyName: null });
      expect(byEmail(SEED_COMPANY.email)).toMatchObject({ role: 'COMPANY', isActive: true, companyId: SEED_COMPANY_ID, companyName: 'Empresa Demo' });
      expect(byEmail(SEED_PASSENGER.email)).toMatchObject({ role: 'PASSENGER', isActive: true });
      expect(byEmail(SEED_ADMIN.email)!.registered).toMatch(/^\d{2}-\d{2}-\d{4}$/);

      const counts = countUsers(users);
      expect(counts.ADMIN + counts.COMPANY + counts.PASSENGER).toBe(users.length);
      expect(JSON.stringify(users)).not.toMatch(/password/i);
    } finally {
      await logout();
    }
  });
});
