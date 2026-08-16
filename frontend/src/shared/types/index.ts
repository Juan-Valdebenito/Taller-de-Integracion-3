// ============================================================
// Tipos compartidos del Frontend
// Espejo de los enums del backend
// ============================================================

export type UserRole = 'PASSENGER' | 'COMPANY' | 'ADMIN';
export type BusStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type OccupancyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL';

// ── Entidades de respuesta de la API ──────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId?: string;
  createdAt: string;
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
}

export interface Route {
  id: string;
  name: string;
  code: string;
  description?: string;
  stops: Stop[];
  companyId: string;
  isActive: boolean;
  createdAt: string;
}

export interface BusLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

export interface Bus {
  id: string;
  patente: string;
  capacity: number;
  currentPassengers: number;
  boardings: number;
  alightings: number;
  schoolBoardings: number;
  status: BusStatus;
  occupancyLevel: OccupancyLevel;
  occupancyPercentage: number;
  routeId?: string;
  companyId: string;
  currentLocation?: BusLocation;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  status: ComplaintStatus;
  passengerId: string;
  busId?: string;
  routeId?: string;
  companyId: string;
  adminResponse?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone?: string;
  isActive: boolean;
}

// ── Respuestas de API ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
