import { prisma } from '../client';
import {ComplaintCategory as PrismaComplaintCategory, ComplaintStatus as PrismaComplaintStatus,} from '@prisma/client';
import type { Complaint as PrismaComplaint } from '@prisma/client';
import { Complaint, ComplaintCategory } from '../../../../domain/entities/Complaint';
import { IComplaintRepository, CreateComplaintData } from '../../../../domain/repositories/IComplaintRepository';
import { ComplaintStatus } from '../../../../shared/enums';


/**
 * Convierte la categoría generada por Prisma al enum del dominio.
 */
function toDomainCategory(
  category: PrismaComplaintCategory,
): ComplaintCategory {
  switch (category) {
    case PrismaComplaintCategory.DELAY:
      return ComplaintCategory.DELAY;
    case PrismaComplaintCategory.OVERCROWDING:
      return ComplaintCategory.OVERCROWDING;
    case PrismaComplaintCategory.DRIVER_BEHAVIOR:
      return ComplaintCategory.DRIVER_BEHAVIOR;
    case PrismaComplaintCategory.VEHICLE_CONDITION:
      return ComplaintCategory.VEHICLE_CONDITION;
    case PrismaComplaintCategory.ACCESSIBILITY:
      return ComplaintCategory.ACCESSIBILITY;
    case PrismaComplaintCategory.OTHER:
      return ComplaintCategory.OTHER;
  }
}

/**
 * Convierte el estado generado por Prisma al enum del dominio.
 */
function toDomainStatus(
  status: PrismaComplaintStatus,
): ComplaintStatus {
  switch (status) {
    case PrismaComplaintStatus.PENDING:
      return ComplaintStatus.PENDING;
    case PrismaComplaintStatus.IN_REVIEW:
      return ComplaintStatus.IN_REVIEW;
    case PrismaComplaintStatus.RESOLVED:
      return ComplaintStatus.RESOLVED;
    case PrismaComplaintStatus.REJECTED:
      return ComplaintStatus.REJECTED;
  }
}

/**
 * Convierte la categoría del dominio al enum de Prisma.
 */
function toPrismaCategory(
  category: ComplaintCategory,
): PrismaComplaintCategory {
  switch (category) {
    case ComplaintCategory.DELAY:
      return PrismaComplaintCategory.DELAY;
    case ComplaintCategory.OVERCROWDING:
      return PrismaComplaintCategory.OVERCROWDING;
    case ComplaintCategory.DRIVER_BEHAVIOR:
      return PrismaComplaintCategory.DRIVER_BEHAVIOR;
    case ComplaintCategory.VEHICLE_CONDITION:
      return PrismaComplaintCategory.VEHICLE_CONDITION;
    case ComplaintCategory.ACCESSIBILITY:
      return PrismaComplaintCategory.ACCESSIBILITY;
    case ComplaintCategory.OTHER:
      return PrismaComplaintCategory.OTHER;
  }
}

/**
 * Convierte el estado del dominio al enum de Prisma.
 */
function toPrismaStatus(
  status: ComplaintStatus,
): PrismaComplaintStatus {
  switch (status) {
    case ComplaintStatus.PENDING:
      return PrismaComplaintStatus.PENDING;
    case ComplaintStatus.IN_REVIEW:
      return PrismaComplaintStatus.IN_REVIEW;
    case ComplaintStatus.RESOLVED:
      return PrismaComplaintStatus.RESOLVED;
    case ComplaintStatus.REJECTED:
      return PrismaComplaintStatus.REJECTED;
  }
}

// ── Mapper: Prisma record → Entidad de dominio ─────────────────
function toEntity(raw: PrismaComplaint): Complaint {
  return new Complaint(
    raw.id,
    raw.title,
    raw.description,
    toDomainCategory(raw.category),
    toDomainStatus(raw.status),
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
export class PrismaComplaintRepository
  implements IComplaintRepository
{
  async findAll(): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<Complaint | null> {
    const row = await prisma.complaint.findUnique({
      where: { id },
    });

    return row ? toEntity(row) : null;
  }

  async findByPassengerId(
    passengerId: string,
  ): Promise<Complaint[]> {
    const rows = await prisma.complaint.findMany({
      where: { passengerId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toEntity);
  }

  async findByCompanyId(
    companyId: string,
  ): Promise<Complaint[]> {
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
        title: data.title,
        description: data.description,
        category: toPrismaCategory(data.category),
        status: toPrismaStatus(data.status),
        passengerId: data.passengerId,
        busId: data.busId,
        routeId: data.routeId,
        companyId: data.companyId,
        adminResponse: data.adminResponse,
      },
    });

    return toEntity(row);
  }

  async update(
    id: string,
    data: Partial<Complaint>,
  ): Promise<Complaint> {
    const row = await prisma.complaint.update({
      where: { id },
      data: {
        ...(data.title !== undefined && {
          title: data.title,
        }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.category !== undefined && {
          category: toPrismaCategory(data.category),
        }),
        ...(data.status !== undefined && {
          status: toPrismaStatus(data.status),
        }),
        ...(data.adminResponse !== undefined && {
          adminResponse: data.adminResponse,
        }),
        ...(data.passengerId !== undefined && {
          passengerId: data.passengerId,
        }),
        ...(data.busId !== undefined && {
          busId: data.busId,
        }),
        ...(data.routeId !== undefined && {
          routeId: data.routeId,
        }),
        ...(data.companyId !== undefined && {
          companyId: data.companyId,
        }),
      },
    });

    return toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.complaint.delete({
      where: { id },
    });
  }
}
