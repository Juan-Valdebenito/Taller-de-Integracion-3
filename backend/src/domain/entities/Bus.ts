import { BusStatus, OccupancyLevel } from '../../shared/enums';

/**
 * Coordenadas geográficas de la micro.
 */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  heading?: number;   // Dirección en grados (0–360)
  speed?: number;     // Velocidad en km/h
  timestamp: Date;
}

/**
 * Entidad de dominio: Micro (Bus)
 * Representa un vehículo de transporte público.
 */
export class Bus {
  constructor(
    public readonly id: string,
    public patente: string,           // Patente del vehículo
    public capacity: number,          // Capacidad máxima de pasajeros
    public currentPassengers: number, // Pasajeros actuales
    public boardings: number,         // Subidas acumuladas del día
    public alightings: number,        // Bajadas acumuladas del día
    public schoolBoardings: number,   // Pasaje escolar del día
    public status: BusStatus,
    public routeId: string | null,    // Ruta asignada
    public companyId: string,         // Empresa propietaria
    public currentLocation: GeoLocation | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Calcula el nivel de ocupación actual de la micro.
   */
  getOccupancyLevel(): OccupancyLevel {
    const ratio = this.currentPassengers / this.capacity;

    if (ratio < 0.4) return OccupancyLevel.LOW;
    if (ratio < 0.7) return OccupancyLevel.MEDIUM;
    if (ratio < 0.9) return OccupancyLevel.HIGH;
    return OccupancyLevel.FULL;
  }

  /**
   * Porcentaje de ocupación (0–100).
   */
  getOccupancyPercentage(): number {
    return Math.round((this.currentPassengers / this.capacity) * 100);
  }

  isActive(): boolean {
    return this.status === BusStatus.ACTIVE;
  }
}
