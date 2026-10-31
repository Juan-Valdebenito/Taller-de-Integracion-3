/**
 * Rutas del sistema en el panel del administrador (funciones puras), como
 * AdminRoutesPage del web.
 */
import type { CompanySummary } from '../api/adminApi';
import type { CompanyBus, CompanyRoute } from '../api/companyApi';

export interface AdminRouteRow extends CompanyRoute {
  /** Nombre de la empresa; si no se pudo cargar la lista de empresas, su id (como el web). */
  companyName: string;
  /** Micros asignadas a la ruta. */
  buses: CompanyBus[];
}

export function buildRouteRows(
  routes: readonly CompanyRoute[],
  buses: readonly CompanyBus[],
  companies: readonly Pick<CompanySummary, 'id' | 'name'>[],
): AdminRouteRow[] {
  const names = new Map(companies.map((company) => [company.id, company.name]));
  return routes.map((route) => ({
    ...route,
    companyName: names.get(route.companyId) ?? route.companyId,
    buses: buses.filter((bus) => bus.routeId === route.id),
  }));
}

export type RouteStatusFilter = 'ALL' | 'active' | 'inactive';

export const ROUTE_STATUS_OPTIONS: readonly { value: RouteStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export interface RouteFilters {
  /** Busca en el código o el nombre (como el web), sin importar mayúsculas ni tildes. */
  search: string;
  /** 'ALL' o el id de una empresa. */
  company: string;
  status: RouteStatusFilter;
}

export const EMPTY_ROUTE_FILTERS: RouteFilters = { search: '', company: 'ALL', status: 'ALL' };

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterRoutes(rows: readonly AdminRouteRow[], { search, company, status }: RouteFilters): AdminRouteRow[] {
  const term = normalize(search.trim());
  return rows.filter((row) => {
    if (company !== 'ALL' && row.companyId !== company) return false;
    if (status === 'active' && !row.isActive) return false;
    if (status === 'inactive' && row.isActive) return false;
    return !term || normalize(row.code).includes(term) || normalize(row.name).includes(term);
  });
}

/** Color del punto de cada paradero en el recorrido: primero azul, último verde (como el web). */
export function stopDotColor(index: number, count: number): 'first' | 'last' | 'middle' {
  if (index === 0) return 'first';
  if (index === count - 1) return 'last';
  return 'middle';
}
