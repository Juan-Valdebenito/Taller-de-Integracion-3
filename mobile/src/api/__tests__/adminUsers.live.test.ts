import { getCurrentUser, login, logout, register } from '../../api/authApi';
import { formFromUser, newUserForm, toNewUserInput, toUserPatch, validateUserForm } from '../../admin/userForm';
import { buildUserRows, countUsers } from '../../admin/users';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER } from '../../test-utils/live/backend';
import { createUser, deactivateUser, fetchCompanies, fetchUsers, updateUser } from '../adminApi';
import { ApiError } from '../errors';

// Usuarios del administrador contra backend-go real: las cuentas del seed con
// su rol, su estado y el nombre de su empresa, la edición y activación de una
// cuenta, y la creación de cuentas por el administrador.

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

  it('edita una cuenta, la desactiva (ya no inicia sesión) y la vuelve a activar', async () => {
    const suffix = Date.now();
    // Cuenta desechable con una contraseña generada en el momento.
    const account = { email: `prueba.${suffix}@example.com`, password: `Prueba-${suffix}` };
    await register({ name: 'Cuenta de Prueba', ...account });
    await logout();

    await login(SEED_ADMIN);
    try {
      const created = (await fetchUsers()).find((user) => user.email === account.email)!;
      expect(created).toMatchObject({ role: 'PASSENGER', isActive: true, companyId: null });

      const form = { ...formFromUser(created), name: 'Cuenta Editada', role: 'COMPANY' as const, companyId: SEED_COMPANY_ID };
      expect(validateUserForm(form, { users: await fetchUsers(), editingId: created.id, isSelf: false })).toBeNull();
      const edited = await updateUser(created.id, toUserPatch(form, created));
      expect(edited).toMatchObject({ id: created.id, name: 'Cuenta Editada', role: 'COMPANY', companyId: SEED_COMPANY_ID, email: account.email });

      await deactivateUser(created.id);
      expect((await fetchUsers()).find((user) => user.id === created.id)!.isActive).toBe(false);
    } finally {
      await logout();
    }
    await expect(login(account)).rejects.toBeInstanceOf(ApiError);

    await login(SEED_ADMIN);
    try {
      const inactive = (await fetchUsers()).find((user) => user.email === account.email)!;
      expect(await updateUser(inactive.id, { isActive: true })).toMatchObject({ isActive: true });
    } finally {
      await logout();
    }
    await expect(login(account)).resolves.toMatchObject({ email: account.email, role: 'COMPANY' });
    await logout();
  });

  it('crea una cuenta de Empresa sin tocar la sesión del administrador, y la cuenta puede entrar', async () => {
    const suffix = Date.now();
    const password = `Inicial-${suffix}`;
    const form = { ...newUserForm(), name: 'Operador Nuevo', email: `operador.${suffix}@example.com`, role: 'COMPANY' as const, companyId: SEED_COMPANY_ID };

    await login(SEED_ADMIN);
    try {
      expect(validateUserForm(form, { users: await fetchUsers(), editingId: null, isSelf: false }, password)).toBeNull();
      const created = await createUser(toNewUserInput(form, password));
      expect(created).toMatchObject({ name: 'Operador Nuevo', email: form.email, role: 'COMPANY', companyId: SEED_COMPANY_ID, isActive: true });
      // Los tokens de la cuenta nueva se descartaron: la sesión sigue siendo la del administrador.
      await expect(getCurrentUser()).resolves.toMatchObject({ email: SEED_ADMIN.email, role: 'ADMIN' });

      // Correo repetido: el backend responde 409 con un mensaje claro.
      await expect(createUser(toNewUserInput(form, password))).rejects.toMatchObject({ status: 409 });
    } finally {
      await logout();
    }

    await expect(login({ email: form.email, password })).resolves.toMatchObject({ role: 'COMPANY', companyId: SEED_COMPANY_ID });
    await logout();
  });
});
