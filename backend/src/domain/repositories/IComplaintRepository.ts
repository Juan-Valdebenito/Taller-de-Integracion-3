import { Complaint } from '../entities/Complaint';

/**
 * Contrato del repositorio de reclamos.
 */
export interface IComplaintRepository {
  findById(id: string): Promise<Complaint | null>;
  findAll(): Promise<Complaint[]>;
  findByPassengerId(passengerId: string): Promise<Complaint[]>;
  findByCompanyId(companyId: string): Promise<Complaint[]>;
  findByBusId(busId: string): Promise<Complaint[]>;
  create(
    complaint: Omit<Complaint, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Complaint>;
  update(id: string, data: Partial<Complaint>): Promise<Complaint>;
  delete(id: string): Promise<void>;
}
