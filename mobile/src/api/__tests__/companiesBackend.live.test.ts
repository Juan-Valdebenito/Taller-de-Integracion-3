import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID } from '../../test-utils/live/backend';
import { apiRequest } from '../client';

// API de empresas de backend-go (solo ADMIN): listar con todos los datos e
// incluir inactivas, crear, editar, duplicados y activar/desactivar.

const API = process.env.EXPO_PUBLIC_API_URL;

interface Company {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

/** RUT chileno válido para un cuerpo de 8 dígitos (dígito verificador módulo 11). */
function rutFor(body: number): string {
  const digits = String(body);
  let sum = 0;
  let factor = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return `${digits}-${rest === 11 ? '0' : rest === 10 ? 'K' : rest}`;
}

beforeEach(() => {
  resetSecureStore();
});

describeLive('API de empresas en backend-go real', () => {
  it('sin sesión responde 401 y una cuenta de empresa recibe 403', async () => {
    expect((await fetch(`${API}/companies`)).status).toBe(401);

    await login(SEED_COMPANY);
    try {
      await expect(apiRequest('/companies', { method: 'POST', body: { name: 'X', rut: rutFor(70000001), email: 'x@x.cl' } })).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await logout();
    }
  });

  it('el administrador crea, edita, desactiva y ve también las inactivas', async () => {
    const stamp = Date.now() % 1_000_000;
    const rut = rutFor(70_000_000 + stamp * 10);
    await login(SEED_ADMIN);
    try {
      const created = await apiRequest<Company>('/companies', {
        method: 'POST',
        body: { name: '  Buses Prueba en vivo  ', rut: rut.replace('-', ''), email: `Vivo-${stamp}@Buses.CL`, phone: '+56 45 222 3333' },
      });
      // El RUT queda con puntos y guion, el correo en minúsculas y la empresa activa.
      expect(created).toMatchObject({ name: 'Buses Prueba en vivo', email: `vivo-${stamp}@buses.cl`, phone: '+56 45 222 3333', address: null, isActive: true });
      expect(created.rut).toMatch(/^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/);

      // El mismo RUT escrito de otra forma es duplicado.
      await expect(apiRequest('/companies', { method: 'POST', body: { name: 'Otra', rut, email: `otra-${stamp}@buses.cl` } })).rejects.toMatchObject({
        status: 409,
        message: 'ya existe una empresa con ese RUT',
      });
      await expect(apiRequest('/companies', { method: 'POST', body: { name: 'Otra', rut: '76.000.000-1', email: 'z@z.cl' } })).rejects.toMatchObject({
        status: 400,
        message: 'el RUT no es válido (ej: 76.123.456-7)',
      });

      const edited = await apiRequest<Company>(`/companies/${created.id}`, {
        method: 'PUT',
        body: { name: 'Buses Prueba SpA', rut: created.rut, email: created.email, address: 'Av. Alemania 0100, Temuco' },
      });
      expect(edited).toMatchObject({ name: 'Buses Prueba SpA', address: 'Av. Alemania 0100, Temuco', phone: null });

      const off = await apiRequest<Company>(`/companies/${created.id}/status`, { method: 'PATCH', body: { isActive: false } });
      expect(off.isActive).toBe(false);

      const all = await apiRequest<Company[]>('/companies');
      expect(all.find((c) => c.id === created.id)?.isActive).toBe(false);
      expect(all.find((c) => c.id === SEED_COMPANY_ID)).toMatchObject({ rut: expect.any(String), email: expect.any(String) });
      const active = await apiRequest<Company[]>('/companies?active=true');
      expect(active.some((c) => c.id === created.id)).toBe(false);
    } finally {
      await logout();
    }
  });
});
