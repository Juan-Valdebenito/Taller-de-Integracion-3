import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { computeDashboardStats } from '../dashboardStats';

const bus = (id: string, status: CompanyBus['status'], routeId: string | null, currentPassengers = 0, capacity = 80): CompanyBus => ({
  id,
  patente: id.toUpperCase(),
  capacity,
  currentPassengers,
  status,
  companyId: 'co1',
  routeId,
});
const route = (id: string, isActive = true): CompanyRoute => ({ id, name: `Ruta ${id}`, code: id, isActive, companyId: 'co1' });

describe('computeDashboardStats', () => {
  it('calcula las 4 tarjetas del web con los datos reales', () => {
    const stats = computeDashboardStats(
      [
        bus('a', 'ACTIVE', 'r1', 30, 80),
        bus('b', 'ACTIVE', 'r1', 12, 60),
        bus('c', 'ACTIVE', null, 5, 40), // en ruta pero sin ruta asignada
        bus('d', 'INACTIVE', 'r2', 50), // no cuenta: no está en servicio
        bus('e', 'MAINTENANCE', 'r3'),
      ],
      [route('r1'), route('r2'), route('r3', false)],
      4,
    );

    expect(stats).toEqual({
      activeBuses: 3,
      totalBuses: 5,
      routesInService: 1, // solo r1 tiene micros en ruta
      activeRoutes: 2,
      passengersOnBoard: 47, // 30 + 12 + 5 (la INACTIVE no suma)
      activeCapacity: 180,
      pendingComplaints: 4,
    });
  });

  it('una ruta inactiva no está en servicio aunque tenga una micro activa', () => {
    const stats = computeDashboardStats([bus('a', 'ACTIVE', 'r1')], [route('r1', false)], 0);
    expect(stats.routesInService).toBe(0);
    expect(stats.activeRoutes).toBe(0);
  });

  it('sin datos todo es cero, y sin reclamos consultados queda null', () => {
    expect(computeDashboardStats([], [], null)).toEqual({
      activeBuses: 0,
      totalBuses: 0,
      routesInService: 0,
      activeRoutes: 0,
      passengersOnBoard: 0,
      activeCapacity: 0,
      pendingComplaints: null,
    });
  });
});
