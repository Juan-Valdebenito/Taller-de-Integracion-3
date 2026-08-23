import { Complaint } from '../entities/Complaint';
import { ComplaintStatus } from '../../shared/enums';
import { ComplaintCategory } from '../entities/Complaint';

/**
 * Tipo de datos para crear un reclamo (sin id ni timestamps ni métodos).
 */
export interface CreateComplaintData {
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  passengerId: string;
  busId: string | null;
  routeId: string | null;
  companyId: string;
  adminResponse: string | null;
}

/**
 * Contrato del repositorio de reclamos.
 */
export interface IComplaintRepository {
  findById(id: string): Promise<Complaint | null>;
  findAll(): Promise<Complaint[]>;
  findByPassengerId(passengerId: string): Promise<Complaint[]>;
  findByCompanyId(companyId: string): Promise<Complaint[]>;
  findByBusId(busId: string): Promise<Complaint[]>;
  create(data: CreateComplaintData): Promise<Complaint>;
  update(id: string, data: Partial<Complaint>): Promise<Complaint>;
  delete(id: string): Promise<void>;
}
