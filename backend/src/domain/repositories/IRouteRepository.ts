import { Route } from '../entities/Route';

/**
 * Contrato del repositorio de rutas.
 */
export interface IRouteRepository {
  findById(id: string): Promise<Route | null>;
  findAll(): Promise<Route[]>;
  findByCompanyId(companyId: string): Promise<Route[]>;
  findActive(): Promise<Route[]>;
  create(route: Omit<Route, 'id' | 'createdAt' | 'updatedAt'>): Promise<Route>;
  update(id: string, data: Partial<Route>): Promise<Route>;
  delete(id: string): Promise<void>;
}
