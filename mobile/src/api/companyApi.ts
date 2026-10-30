/** Operaciones de empresa sobre la API de backend-go. */
import { apiRequest } from './client';

export interface CompanyBus {
  id: string;
  patente: string;
  capacity: number;
  currentPassengers: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  companyId: string;
  routeId?: string | null;
}

export interface CompanyRoute {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  companyId: string;
}

export async function fetchCompanyBuses(companyId?: string | null): Promise<CompanyBus[]> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const buses = await apiRequest<CompanyBus[] | null>(`/buses${query}`);
  return Array.isArray(buses) ? buses : [];
}

export async function fetchCompanyRoutes(): Promise<CompanyRoute[]> {
  const routes = await apiRequest<CompanyRoute[] | null>('/routes');
  return Array.isArray(routes) ? routes : [];
}

/** Datos del formulario de micro (crear y editar, como el web). */
export interface CompanyBusInput {
  patente: string;
  capacity: number;
  /** null = sin ruta asignada. */
  routeId: string | null;
}

/** Registra una micro en la empresa (POST /buses). backend-go la crea INACTIVE. */
export function createCompanyBus(input: CompanyBusInput & { companyId: string }): Promise<CompanyBus> {
  return apiRequest<CompanyBus>('/buses', { method: 'POST', body: input });
}

/** Reemplaza los datos de una micro (PUT /buses/:id: patente, capacidad, estado y ruta). */
export function saveCompanyBus(id: string, input: CompanyBusInput & { status: CompanyBus['status'] }): Promise<CompanyBus> {
  return apiRequest<CompanyBus>(`/buses/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
}

export function updateCompanyBus(
  id: string,
  changes: { status?: CompanyBus['status']; routeId?: string },
): Promise<CompanyBus> {
  return apiRequest<CompanyBus>(`/buses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes,
  });
}

/** Resumen de reclamos de la empresa (GET /complaints/stats?companyId=…). */
export interface CompanyComplaintStats {
  total: number;
  pending: number;
  inReview: number;
  resolved: number;
  rejected: number;
}

export async function fetchCompanyComplaintStats(companyId: string): Promise<CompanyComplaintStats> {
  const raw = await apiRequest<Partial<Record<string, unknown>> | null>(`/complaints/stats?companyId=${encodeURIComponent(companyId)}`);
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  return {
    total: count(raw?.totalComplaints),
    pending: count(raw?.pendingCount),
    inReview: count(raw?.inReviewCount),
    resolved: count(raw?.resolvedCount),
    rejected: count(raw?.rejectedCount),
  };
}

/** Paradero de una ruta (GET /routes/:id/stops). */
export interface RouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Posición en el recorrido (1, 2, 3…). */
  order: number;
}

/** Paraderos de la ruta en el orden del recorrido. */
export async function fetchRouteStops(routeId: string): Promise<RouteStop[]> {
  const raw = await apiRequest<Array<Partial<RouteStop>> | null>(`/routes/${encodeURIComponent(routeId)}/stops`);
  return (Array.isArray(raw) ? raw : [])
    .filter((stop) => stop?.id)
    .map((stop) => ({
      id: String(stop.id),
      name: String(stop.name ?? '').trim() || 'Paradero sin nombre',
      latitude: Number(stop.latitude ?? 0),
      longitude: Number(stop.longitude ?? 0),
      order: Number(stop.order ?? 0),
    }))
    .sort((a, b) => a.order - b.order);
}
