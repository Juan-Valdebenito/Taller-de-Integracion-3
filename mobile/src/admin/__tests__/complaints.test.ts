import type { CompanySummary } from '../../api/adminApi';
import type { CompanyBus } from '../../api/companyApi';
import type { Complaint } from '../../api/complaintsApi';
import { adminStatus, buildComplaintRows, EMPTY_COMPLAINT_FILTERS, filterComplaints } from '../complaints';

const base = { busId: null, routeId: null, companyId: null, adminResponse: null, rating: null, lineName: null, updatedAt: '' };
const complaints: Complaint[] = [
  { ...base, id: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789', title: 'Micro llena', description: 'No se pudo subir en Avenida Alemania', category: 'OVERCROWDING', status: 'PENDING', lineName: '7A', rating: 2, companyId: 'co1', busId: 'b1', createdAt: '2026-10-16T15:00:00Z' },
  { ...base, id: 'c2', title: 'Chofer apurado', description: 'Frenadas bruscas', category: 'DRIVER_BEHAVIOR', status: 'RESOLVED', lineName: '1C', companyId: 'co-borrada', busId: 'b-borrada', createdAt: '' },
  { ...base, id: 'c3', title: 'Atraso', description: 'Esperé 40 minutos', category: 'DELAY', status: 'IN_REVIEW', lineName: '7B', createdAt: '2026-10-20T12:00:00Z' },
];
const companies: CompanySummary[] = [{ id: 'co1', name: 'Buses Ñielol', rut: '', email: '', phone: null, address: null, isActive: true }];
const buses: CompanyBus[] = [{ id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 0, status: 'ACTIVE', companyId: 'co1', routeId: null }];

describe('buildComplaintRows', () => {
  it('agrega id corto, empresa, patente y fecha', () => {
    const [first, second, third] = buildComplaintRows(complaints, companies, buses);
    expect(first).toMatchObject({ shortId: 'a1b2c3d4', companyName: 'Buses Ñielol', busPlate: 'DEMO-01', date: '16 de octubre de 2026' });
    // Lo que no está en las listas se muestra por su id, como el web.
    expect(second).toMatchObject({ shortId: 'c2', companyName: 'co-borrada', busPlate: 'b-borrada', date: '' });
    expect(third).toMatchObject({ companyName: null, busPlate: null });
  });

  it('un estado desconocido se muestra tal cual', () => {
    expect(adminStatus('RESOLVED').label).toBe('RESUELTO');
    expect(adminStatus('ARCHIVED').label).toBe('ARCHIVED');
  });
});

describe('filterComplaints', () => {
  const rows = buildComplaintRows(complaints, companies, buses);
  const ids = (filters: Partial<typeof EMPTY_COMPLAINT_FILTERS>) => filterComplaints(rows, { ...EMPTY_COMPLAINT_FILTERS, ...filters }).map((r) => r.id);

  it('filtra por línea, estado y categoría', () => {
    expect(ids({ line: '7B' })).toEqual(['c3']);
    expect(ids({ status: 'RESOLVED' })).toEqual(['c2']);
    expect(ids({ category: 'OVERCROWDING' })).toEqual([complaints[0]!.id]);
    expect(ids({ line: '7A', status: 'RESOLVED' })).toEqual([]);
  });

  it('busca por id, título, descripción, micro, patente o empresa sin importar tildes', () => {
    expect(ids({ search: 'A1B2' })).toEqual([complaints[0]!.id]);
    expect(ids({ search: 'atraso' })).toEqual(['c3']);
    expect(ids({ search: 'frenadas' })).toEqual(['c2']);
    expect(ids({ search: 'demo-01' })).toEqual([complaints[0]!.id]);
    expect(ids({ search: 'nielol' })).toEqual([complaints[0]!.id]);
    expect(ids({ search: '   ' })).toHaveLength(3);
  });
});
