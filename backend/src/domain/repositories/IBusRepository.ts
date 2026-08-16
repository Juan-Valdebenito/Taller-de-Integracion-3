import { Bus } from '../entities/Bus';
import { GeoLocation } from '../entities/Bus';

/**
 * Contrato del repositorio de micros.
 */
export interface IBusRepository {
  findById(id: string): Promise<Bus | null>;
  findAll(): Promise<Bus[]>;
  findByRouteId(routeId: string): Promise<Bus[]>;
  findByCompanyId(companyId: string): Promise<Bus[]>;
  findActiveByRouteId(routeId: string): Promise<Bus[]>;
  create(bus: Omit<Bus, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bus>;
  update(id: string, data: Partial<Bus>): Promise<Bus>;
  updateLocation(id: string, location: GeoLocation): Promise<void>;
  delete(id: string): Promise<void>;
}
