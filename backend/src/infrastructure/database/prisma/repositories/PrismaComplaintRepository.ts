import { prisma } from '../client';
import { Complaint, ComplaintCategory } from '../../../../domain/entities/Complaint';
import { IComplaintRepository, CreateComplaintData } from '../../../../domain/repositories/IComplaintRepository';
import { ComplaintStatus } from '../../../../shared/enums';


// ── Mapper: Prisma record → Entidad de dominio ─────────────────
function toEntity(raw: {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  adminResponse: string | null;
  passengerId: string;
  busId: string | null;
  routeId: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}): Complaint {
  return new Complaint(
    raw.id,
    raw.title,
    raw.description,
    raw.category as ComplaintCategory,
    raw.status as ComplaintStatus,
    raw.passengerId,
    raw.busId,
    raw.routeId,
    raw.companyId,
    raw.adminResponse,
    raw.createdAt,
    raw.updatedAt,
  );
}

// ── Implementación del repositorio ─────────────────────────────
export class PrismaComplaintRepository implements IComplaintRepository {

  async findAll(): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<Complaint | null> {
    const row = await prisma.complaint.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByPassengerId(passengerId: string): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      where: { passengerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEntity);
  }

  async findByCompanyId(companyId: string): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEntity);
  }

  async findByBusId(busId: string): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      where: { busId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEntity);
  }

  async create(
    data: CreateComplaintData,
  ): Promise<Complaint> {
    const row = await prisma.complaint.create({
      data: {
        title:       data.title,
        description: data.description,
        category:    data.category,
        status:      data.status,
        passengerId: data.passengerId,
        busId:       data.busId ?? undefined,
        routeId:     data.routeId ?? undefined,
        companyId:   data.companyId,
        adminResponse: data.adminResponse ?? undefined,
      },
    });
    return toEntity(row);
  }

  async update(id: string, data: Partial<Complaint>): Promise<Complaint> {
    const row = await prisma.complaint.update({
      where: { id },
      data: {
        ...(data.title        !== undefined && { title:         data.title }),
        ...(data.description  !== undefined && { description:   data.description }),
        ...(data.category     !== undefined && { category:      data.category }),
        ...(data.status       !== undefined && { status:        data.status }),
        ...(data.adminResponse !== undefined && { adminResponse: data.adminResponse }),
      },
    });
    return toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.complaint.delete({ where: { id } });
  }
}
