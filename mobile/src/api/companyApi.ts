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

export function updateCompanyBus(
  id: string,
  changes: { status?: CompanyBus['status']; routeId?: string },
): Promise<CompanyBus> {
  return apiRequest<CompanyBus>(`/buses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes,
  });
}
