import { ComplaintStatus } from '../../shared/enums';

/**
 * Categorías de reclamo disponibles para los pasajeros.
 */
export enum ComplaintCategory {
  DELAY = 'DELAY',               // Atraso / no llegó
  OVERCROWDING = 'OVERCROWDING', // Sobrepoblación
  DRIVER_BEHAVIOR = 'DRIVER_BEHAVIOR', // Conducta del conductor
  VEHICLE_CONDITION = 'VEHICLE_CONDITION', // Estado del vehículo
  ACCESSIBILITY = 'ACCESSIBILITY', // Accesibilidad
  OTHER = 'OTHER',
}

/**
 * Entidad de dominio: Reclamo
 * Enviado por un pasajero sobre una micro o ruta específica.
 */
export class Complaint {
  constructor(
    public readonly id: string,
    public title: string,
    public description: string,
    public category: ComplaintCategory,
    public status: ComplaintStatus,
    public passengerId: string,       // Usuario que envió el reclamo
    public busId: string | null,      // Micro implicada (opcional)
    public routeId: string | null,    // Ruta implicada (opcional)
    public companyId: string,         // Empresa a la que pertenece
    public adminResponse: string | null, // Respuesta de la empresa/admin
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  isPending(): boolean {
    return this.status === ComplaintStatus.PENDING;
  }

  resolve(response: string): void {
    this.status = ComplaintStatus.RESOLVED;
    this.adminResponse = response;
    this.updatedAt = new Date();
  }

  reject(reason: string): void {
    this.status = ComplaintStatus.REJECTED;
    this.adminResponse = reason;
    this.updatedAt = new Date();
  }
}
