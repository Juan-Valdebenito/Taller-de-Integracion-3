/**
 * Números del dashboard de empresa: las 4 tarjetas del web
 * (CompanyDashboardPage: Micros activas, Rutas en servicio, Pasajeros hoy,
 * Reclamos pendientes), que allá todavía muestran "—", calculados con los
 * datos reales de backend-go. Funciones puras.
 */
import type { CompanyBus, CompanyRoute } from '../api/companyApi';

export interface CompanyDashboardStats {
  /** Micros en estado ACTIVE. */
  activeBuses: number;
  totalBuses: number;
  /** Rutas activas con al menos una micro ACTIVE asignada. */
  routesInService: number;
  activeRoutes: number;
  /**
   * Pasajeros a bordo ahora en las micros ACTIVE. El web dice "Pasajeros hoy",
   * pero backend-go no guarda un total diario.
   */
  passengersOnBoard: number;
  /** Capacidad de las micros ACTIVE (para "x de y"). */
  activeCapacity: number;
  /** null si no se pudo consultar (la tarjeta muestra "—", como el web). */
  pendingComplaints: number | null;
}

export function computeDashboardStats(
  buses: readonly CompanyBus[],
  routes: readonly CompanyRoute[],
  pendingComplaints: number | null,
): CompanyDashboardStats {
  const active = buses.filter((bus) => bus.status === 'ACTIVE');
  const routesWithActiveBus = new Set(active.map((bus) => bus.routeId).filter((id): id is string => !!id));
  const activeRoutes = routes.filter((route) => route.isActive);
  return {
    activeBuses: active.length,
    totalBuses: buses.length,
    routesInService: activeRoutes.filter((route) => routesWithActiveBus.has(route.id)).length,
    activeRoutes: activeRoutes.length,
    passengersOnBoard: active.reduce((total, bus) => total + (bus.currentPassengers || 0), 0),
    activeCapacity: active.reduce((total, bus) => total + (bus.capacity || 0), 0),
    pendingComplaints,
  };
}
