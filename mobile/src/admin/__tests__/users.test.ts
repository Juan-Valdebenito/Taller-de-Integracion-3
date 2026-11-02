import type { AdminUser, CompanySummary } from '../../api/adminApi';
import { buildUserRows, countUsers, EMPTY_USER_FILTERS, filterUsers, formatRegistered, userInitials } from '../users';

const users: AdminUser[] = [
  { id: 'u1', name: 'Rodrigo Vásquez Soto', email: 'admin@transporte.cl', role: 'ADMIN', isActive: true, companyId: null, createdAt: '2025-01-15T12:00:00Z' },
  { id: 'u2', name: 'Claudia Torres', email: 'claudia@nielol.cl', role: 'COMPANY', isActive: true, companyId: 'co1', createdAt: '2025-02-03T12:00:00Z' },
  { id: 'u3', name: 'valentina', email: 'val@gmail.com', role: 'PASSENGER', isActive: false, companyId: null, createdAt: null },
  { id: 'u4', name: 'Felipe Rojas', email: 'felipe@gmail.com', role: 'COMPANY', isActive: true, companyId: 'co-borrada', createdAt: 'no es fecha' },
];
const companies: CompanySummary[] = [{ id: 'co1', name: 'Buses Ñielol', rut: '', email: '', phone: null, address: null, isActive: true }];

describe('buildUserRows', () => {
  it('agrega el nombre de la empresa, las iniciales y la fecha de registro', () => {
    const rows = buildUserRows(users, companies);
    expect(rows[0]).toMatchObject({ companyName: null, initials: 'RV', registered: '15-01-2025' });
    expect(rows[1]).toMatchObject({ companyName: 'Buses Ñielol', initials: 'CT', registered: '03-02-2025' });
    expect(rows[2]).toMatchObject({ initials: 'V', registered: '—' });
    // Empresa que ya no está en la lista: se muestra su id, como el web.
    expect(rows[3]).toMatchObject({ companyName: 'co-borrada', registered: '—' });
  });

  it('las iniciales nunca quedan vacías', () => {
    expect(userInitials('   ')).toBe('?');
    expect(userInitials('ana  maría  lópez')).toBe('AM');
    expect(formatRegistered(null)).toBe('—');
  });
});

describe('filterUsers', () => {
  const rows = buildUserRows(users, companies);
  const ids = (filters: Partial<typeof EMPTY_USER_FILTERS>) => filterUsers(rows, { ...EMPTY_USER_FILTERS, ...filters }).map((r) => r.id);

  it('busca por nombre, correo o empresa sin importar mayúsculas ni tildes', () => {
    expect(ids({ search: 'VASQUEZ' })).toEqual(['u1']);
    expect(ids({ search: 'gmail' })).toEqual(['u3', 'u4']);
    expect(ids({ search: 'nielol' })).toEqual(['u2']);
    expect(ids({ search: '  ' })).toHaveLength(4);
  });

  it('filtra por rol y por estado', () => {
    expect(ids({ role: 'COMPANY' })).toEqual(['u2', 'u4']);
    expect(ids({ status: 'inactive' })).toEqual(['u3']);
    expect(ids({ role: 'PASSENGER', status: 'active' })).toEqual([]);
  });
});

it('countUsers cuenta cada rol y los inactivos', () => {
  expect(countUsers(users)).toEqual({ ADMIN: 1, COMPANY: 2, PASSENGER: 1, inactive: 1 });
});
