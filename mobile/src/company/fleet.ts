/**
 * Flota de micros de la empresa (funciones puras), con los textos, colores y
 * cálculos de CompanyBusesPage del web. backend-go además tiene el estado
 * OUT_OF_SERVICE, que el web no muestra.
 */
import type { CompanyBus } from '../api/companyApi';

export type FleetStatus = CompanyBus['status'];

/** Etiqueta y colores de cada estado (STATUS_INFO del web). */
export const FLEET_STATUS: Readonly<Record<FleetStatus, { label: string; color: string; bg: string; border: string }>> = {
  ACTIVE: { label: 'EN SERVICIO', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)' },
  MAINTENANCE: { label: 'EN TALLER', color: '#facc15', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)' },
  INACTIVE: { label: 'INACTIVA', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.4)' },
  OUT_OF_SERVICE: { label: 'FUERA DE SERVICIO', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)' },
};

/** Opciones del filtro "Estado Operacional", con los textos del web. */
export const FLEET_STATUS_FILTER: readonly { value: 'ALL' | FleetStatus; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'En Servicio' },
  { value: 'MAINTENANCE', label: 'En Taller' },
  { value: 'INACTIVE', label: 'Inactiva' },
  { value: 'OUT_OF_SERVICE', label: 'Fuera de servicio' },
];

export interface FleetStats {
  total: number;
  active: number;
  maintenance: number;
  /** "En Reserva / Parada": inactivas y fuera de servicio. */
  reserve: number;
  /** Aforo promedio de las micros en servicio (0 a 100+). */
  avgOccupancy: number;
}

export function fleetStats(buses: readonly CompanyBus[]): FleetStats {
  const active = buses.filter((bus) => bus.status === 'ACTIVE');
  const capacity = active.reduce((total, bus) => total + (bus.capacity || 0), 0);
  const passengers = active.reduce((total, bus) => total + (bus.currentPassengers || 0), 0);
  return {
    total: buses.length,
    active: active.length,
    maintenance: buses.filter((bus) => bus.status === 'MAINTENANCE').length,
    reserve: buses.filter((bus) => bus.status === 'INACTIVE' || bus.status === 'OUT_OF_SERVICE').length,
    avgOccupancy: capacity > 0 ? Math.round((passengers / capacity) * 100) : 0,
  };
}

export const occupancyOf = (bus: Pick<CompanyBus, 'currentPassengers' | 'capacity'>) =>
  bus.capacity > 0 ? Math.round(((bus.currentPassengers || 0) / bus.capacity) * 100) : 0;

/** Color del porcentaje de una micro: verde, amarillo desde 70 %, rojo desde 100 % (como el web). */
export const occupancyTextColor = (pct: number) => (pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#4ade80');
/** Color de su barra: celeste, amarillo desde 70 %, rojo desde 100 %. */
export const occupancyBarColor = (pct: number) => (pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#38bdf8');
/** Barra del aforo promedio: celeste, amarillo sobre 70 %, rojo sobre 90 %. */
export const avgOccupancyColor = (pct: number) => (pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#38bdf8');

/** "Línea Asignada": todas, una ruta, o "NONE" (sin ruta asignada). */
export type FleetRouteFilter = 'ALL' | 'NONE' | string;

export interface FleetFilters {
  route: FleetRouteFilter;
  status: 'ALL' | FleetStatus;
  /** Busca en la patente o el id, sin importar mayúsculas. */
  search: string;
}

export const EMPTY_FLEET_FILTERS: FleetFilters = { route: 'ALL', status: 'ALL', search: '' };

export function filterFleet(buses: readonly CompanyBus[], { route, status, search }: FleetFilters): CompanyBus[] {
  const term = search.trim().toLowerCase();
  return buses.filter((bus) => {
    if (route === 'NONE' && bus.routeId) return false;
    if (route !== 'ALL' && route !== 'NONE' && bus.routeId !== route) return false;
    if (status !== 'ALL' && bus.status !== status) return false;
    if (term && !bus.patente.toLowerCase().includes(term) && !bus.id.toLowerCase().includes(term)) return false;
    return true;
  });
}
