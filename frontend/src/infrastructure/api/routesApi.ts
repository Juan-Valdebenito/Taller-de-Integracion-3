import { apiClient } from './apiClient';

export interface ApiRoute {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
  routeId: string;
}

export interface RouteBus {
  id: string;
  patente: string;
  capacity: number;
  currentPassengers: number;
  status: string;
  companyId: string;
  routeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface CreateRouteRequest {
  name: string;
  code: string;
  description?: string;
  companyId: string;
}

export interface UpdateRouteRequest {
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

export const routesApi = {
    async getAll(): Promise<ApiRoute[]> {
        const response = await apiClient.get<ApiRoute[]>('/routes/');
        return response.data;
    },

    async getById(id: string): Promise<ApiRoute> {
        const response = await apiClient.get<ApiRoute>(`/routes/${id}`);
        return response.data;
    },

    async getStops(id: string): Promise<RouteStop[]> {
        const response = await apiClient.get<RouteStop[]>(`/routes/${id}/stops`);
        return response.data;
    },

    async getBuses(id: string): Promise<RouteBus[]> {
        const response = await apiClient.get<RouteBus[]>(`/routes/${id}/buses`);
        return response.data;
    },

    async create(data: CreateRouteRequest): Promise<ApiRoute> {
        const response = await apiClient.post<ApiRoute>('/routes/', data);
        return response.data; 
    },

    async update(id: string, data: UpdateRouteRequest): Promise<ApiRoute> {
        const response = await apiClient.put<ApiRoute>(`/routes/${id}`, data);
        return response.data;
    },

    async delete(id: string): Promise<void> {
        await apiClient.delete(`/routes/${id}`);
    },

    async getCompanies(): Promise<Company[]> {
        const response = await apiClient.get<Company[]>('/companies/');
        return response.data;
    },
};