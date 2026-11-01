import { login, logout, register } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER } from '../../test-utils/live/backend';
import { createUser, updateUser } from '../adminApi';
import { apiRequest } from '../client';

// Seguridad de usuarios contra backend-go real: lo que antes se podía hacer
// sin ser administrador y ahora se rechaza.

beforeEach(() => {
  resetSecureStore();
});

describeLive('seguridad de usuarios en backend-go real', () => {
  it('sin sesión no se pueden listar, cambiar ni desactivar cuentas', async () => {
    await expect(apiRequest('/users', { auth: false })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/users/cualquiera', { method: 'PATCH', auth: false, body: { role: 'ADMIN' } })).rejects.toMatchObject({ status: 401 });
    await expect(apiRequest('/users/cualquiera', { method: 'DELETE', auth: false })).rejects.toMatchObject({ status: 401 });
  });

  it('un pasajero o una empresa no pueden listar cuentas ni darse el rol de administrador', async () => {
    for (const account of [SEED_PASSENGER, SEED_COMPANY]) {
      const me = await login(account);
      try {
        await expect(apiRequest('/users')).rejects.toMatchObject({ status: 403 });
        await expect(apiRequest(`/users/${me.id}`, { method: 'PATCH', body: { role: 'ADMIN' } })).rejects.toMatchObject({ status: 403 });
        await expect(apiRequest('/users', { method: 'POST', body: { name: 'X', email: `x.${Date.now()}@example.com`, password: 'Password123!', role: 'ADMIN' } })).rejects.toMatchObject({ status: 403 });
      } finally {
        await logout();
      }
    }

    // El rol no cambió.
    await login(SEED_ADMIN);
    try {
      const users = await apiRequest<Array<{ email: string; role: string }>>('/users');
      expect(users.find((u) => u.email === SEED_PASSENGER.email)?.role).toBe('PASSENGER');
    } finally {
      await logout();
    }
  });

  it('el registro público no crea administradores ni deja elegir empresa', async () => {
    const suffix = Date.now();
    await expect(
      apiRequest('/auth/register', { method: 'POST', auth: false, body: { name: 'Intruso', email: `intruso.${suffix}@example.com`, password: 'Password123!', role: 'ADMIN' } }),
    ).rejects.toMatchObject({ status: 403 });

    // Una cuenta de empresa se crea sin empresa, aunque la pida: se la asigna un administrador.
    const company = await apiRequest<{ user: { role: string; companyId: string | null } }>('/auth/register', {
      method: 'POST',
      auth: false,
      body: { name: 'Empresa Nueva', email: `empresa.${suffix}@example.com`, password: 'Password123!', role: 'COMPANY', companyId: SEED_COMPANY_ID },
    });
    expect(company.user).toMatchObject({ role: 'COMPANY', companyId: null });

    // El registro de pasajeros sigue funcionando.
    await expect(register({ name: 'Pasajera Nueva', email: `pasajera.${suffix}@example.com`, password: 'Password123!' })).resolves.toMatchObject({ role: 'PASSENGER' });
    await logout();
  });

  it('el administrador no puede dejarse fuera del panel', async () => {
    const admin = await login(SEED_ADMIN);
    try {
      await expect(updateUser(admin.id, { role: 'PASSENGER' })).rejects.toMatchObject({ status: 403, message: 'No puedes quitarte el rol de administrador' });
      await expect(updateUser(admin.id, { isActive: false })).rejects.toMatchObject({ status: 403, message: 'No puedes desactivar tu propia cuenta' });
      await expect(apiRequest(`/users/${admin.id}`, { method: 'DELETE' })).rejects.toMatchObject({ status: 403 });
      // Cambiar su propio nombre sí puede.
      await expect(updateUser(admin.id, { name: admin.name })).resolves.toMatchObject({ role: 'ADMIN', isActive: true });
    } finally {
      await logout();
    }
  });

  it('al dejar de ser Empresa la cuenta pierde su empresa; correo repetido y rol inválido son errores claros', async () => {
    const suffix = Date.now();
    await login(SEED_ADMIN);
    try {
      const operator = await createUser({ name: 'Operador Temporal', email: `temporal.${suffix}@example.com`, password: 'Password123!', role: 'COMPANY', companyId: SEED_COMPANY_ID });
      expect(operator.companyId).toBe(SEED_COMPANY_ID);

      await expect(updateUser(operator.id, { role: 'PASSENGER' })).resolves.toMatchObject({ role: 'PASSENGER', companyId: null });

      await expect(updateUser(operator.id, { email: SEED_PASSENGER.email })).rejects.toMatchObject({ status: 409, message: 'El email ya está registrado por otra cuenta' });
      await expect(apiRequest(`/users/${operator.id}`, { method: 'PATCH', body: { role: 'ROOT' } })).rejects.toMatchObject({ status: 400 });
      await expect(apiRequest(`/users/${operator.id}`, { method: 'PATCH', body: { role: 'COMPANY', companyId: 'no-existe' } })).rejects.toMatchObject({
        status: 400,
        message: 'La empresa indicada no existe',
      });
    } finally {
      await logout();
    }
  });
});
