import { login, logout, register } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER } from '../../test-utils/live/backend';
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
});
