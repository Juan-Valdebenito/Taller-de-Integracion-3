import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { buildRouteRows, EMPTY_ROUTE_FILTERS, filterRoutes, stopDotColor } from '../routes';

const route = (id: string, code: string, name: string, companyId: string, isActive = true): CompanyRoute => ({
  id,
  code,
  name,
  companyId,
  isActive,
  description: null,
});
const bus = (id: string, routeId: string | null): CompanyBus => ({ id, patente: id, capacity: 40, currentPassengers: 0, status: 'INACTIVE', companyId: 'co1', routeId });

const rows = buildRouteRows(
  [route('r1', '7A', 'Cajón / Santa Rosa', 'co1'), route('r2', '1C', 'Labranza / Centro', 'co2', false), route('r3', 'X9', 'Sin empresa conocida', 'co9')],
  [bus('b1', 'r1'), bus('b2', 'r1'), bus('b3', null)],
  [
    { id: 'co1', name: 'Buses Ñielol' },
    { id: 'co2', name: 'Trans Sur' },
  ],
);

describe('rutas del administrador', () => {
  it('agrega el nombre de la empresa y las micros de cada ruta', () => {
    expect(rows.map((r) => [r.id, r.companyName, r.buses.map((b) => b.id)])).toEqual([
      ['r1', 'Buses Ñielol', ['b1', 'b2']],
      ['r2', 'Trans Sur', []],
      ['r3', 'co9', []], // empresa desconocida: su id, como el web
    ]);
  });

  it('busca por código o nombre sin importar mayúsculas ni tildes, y filtra por empresa y estado', () => {
    const ids = (f: Partial<typeof EMPTY_ROUTE_FILTERS>) => filterRoutes(rows, { ...EMPTY_ROUTE_FILTERS, ...f }).map((r) => r.id);
    expect(ids({})).toEqual(['r1', 'r2', 'r3']);
    expect(ids({ search: '7a' })).toEqual(['r1']);
    expect(ids({ search: 'cajon' })).toEqual(['r1']);
    expect(ids({ company: 'co2' })).toEqual(['r2']);
    expect(ids({ status: 'active' })).toEqual(['r1', 'r3']);
    expect(ids({ status: 'inactive' })).toEqual(['r2']);
  });

  it('el primer paradero va en azul y el último en verde, como el web', () => {
    expect([0, 1, 2].map((i) => stopDotColor(i, 3))).toEqual(['first', 'middle', 'last']);
    expect(stopDotColor(0, 1)).toBe('first');
  });
});
