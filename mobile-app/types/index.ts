// ============================================================
// TransitHub Mobile — Shared domain types
// Mirror of backend ENUMs & entities
// ============================================================

export type UserRole = 'PASSENGER' | 'COMPANY' | 'ADMIN';
export type BusStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type OccupancyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId?: string;
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

export interface Trip {
  id: string;
  departureTime: string;
  arrivalTime?: string;
  status: TripStatus;
  busId: string;
  routeId: string;
}

export interface Company {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone?: string;
  isActive: boolean;
}

// ── Driver-mode local types ───────────────────────────────────

export interface DriverBus {
  id: string;
  plate: string;
  capacity: number;
  passengers: number;
  status: 'Disponible' | 'En servicio' | 'Mantenimiento';
}

export interface DriverRoute {
  id: string;
  code: string;
  name: string;
  stops: string[];
  duration: string;
}
