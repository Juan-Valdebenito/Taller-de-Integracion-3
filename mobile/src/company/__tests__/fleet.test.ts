import type { CompanyBus } from '../../api/companyApi';
import {
  avgOccupancyColor,
  EMPTY_FLEET_FILTERS,
  filterFleet,
  FLEET_STATUS,
  fleetStats,
  occupancyBarColor,
  occupancyOf,
  occupancyTextColor,
} from '../fleet';

const bus = (id: string, patente: string, status: CompanyBus['status'], routeId: string | null, currentPassengers = 0, capacity = 40): CompanyBus => ({
  id,
  patente,
  capacity,
  currentPassengers,
  status,
  companyId: 'co1',
  routeId,
});
const fleet = [
  bus('bus-7a-01', 'BGPK-45', 'ACTIVE', 'r7a', 14, 35),
  bus('bus-7b-01', 'MXPN-77', 'ACTIVE', 'r7b', 40, 40),
  bus('bus-res-01', 'FGRT-33', 'MAINTENANCE', null),
  bus('bus-res-02', 'HJTY-88', 'INACTIVE', null),
  bus('bus-old', 'ZZZZ-99', 'OUT_OF_SERVICE', 'r7a'),
];

describe('flota de micros', () => {
  it('usa los estados del web (y suma "fuera de servicio" del backend)', () => {
    expect(FLEET_STATUS.ACTIVE.label).toBe('EN SERVICIO');
    expect(FLEET_STATUS.MAINTENANCE.label).toBe('EN TALLER');
    expect(FLEET_STATUS.INACTIVE.label).toBe('INACTIVA');
    expect(FLEET_STATUS.OUT_OF_SERVICE.label).toBe('FUERA DE SERVICIO');
  });

  it('calcula las 5 cifras: aforo promedio solo con las micros en servicio', () => {
    expect(fleetStats(fleet)).toEqual({ total: 5, active: 2, maintenance: 1, reserve: 2, avgOccupancy: 72 }); // 54 / 75
    expect(fleetStats([]).avgOccupancy).toBe(0);
  });

  it('ocupación y colores como el web', () => {
    expect(occupancyOf(fleet[0])).toBe(40);
    expect(occupancyOf({ currentPassengers: 3, capacity: 0 })).toBe(0);
    expect([occupancyTextColor(69), occupancyTextColor(70), occupancyTextColor(100)]).toEqual(['#4ade80', '#f59e0b', '#ef4444']);
    expect([occupancyBarColor(69), occupancyBarColor(70), occupancyBarColor(100)]).toEqual(['#38bdf8', '#f59e0b', '#ef4444']);
    expect([avgOccupancyColor(70), avgOccupancyColor(71), avgOccupancyColor(91)]).toEqual(['#38bdf8', '#f59e0b', '#ef4444']);
  });

  it('filtra por línea (también "sin ruta"), estado y patente o id', () => {
    const ids = (filters: Partial<typeof EMPTY_FLEET_FILTERS>) => filterFleet(fleet, { ...EMPTY_FLEET_FILTERS, ...filters }).map((b) => b.id);

    expect(ids({})).toHaveLength(5);
    expect(ids({ route: 'r7a' })).toEqual(['bus-7a-01', 'bus-old']);
    expect(ids({ route: 'NONE' })).toEqual(['bus-res-01', 'bus-res-02']);
    expect(ids({ status: 'ACTIVE' })).toEqual(['bus-7a-01', 'bus-7b-01']);
    expect(ids({ search: ' bgpk ' })).toEqual(['bus-7a-01']);
    expect(ids({ search: 'res-02' })).toEqual(['bus-res-02']);
    expect(ids({ route: 'r7a', status: 'ACTIVE', search: '45' })).toEqual(['bus-7a-01']);
  });
});
