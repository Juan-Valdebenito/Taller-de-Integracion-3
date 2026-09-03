import { prisma } from './prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ComplaintCategory, ComplaintStatus } from '@prisma/client';

export interface ComplaintRecord {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  rating: number;
  status: ComplaintStatus;
  adminResponse: string | null;
  busId: string | null;
  lineName: string | null;
  passengerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Store en memoria con incidentes simulados
const memoryComplaints: ComplaintRecord[] = [
  {
    id: 'comp-001',
    title: 'Exceso de aforo en hora punta',
    description: 'El microbús de la Línea 7A iba sobrecargado con más de 35 pasajeros. Las puertas apenas cerraban en paradero Centro.',
    category: ComplaintCategory.OVERCROWDING,
    rating: 2,
    status: ComplaintStatus.PENDING,
    adminResponse: null,
    busId: 'B-7A-01',
    lineName: '7A',
    passengerId: 'usr-pass-01',
    createdAt: new Date(Date.now() - 3600000 * 3), // hace 3 horas
    updatedAt: new Date(Date.now() - 3600000 * 3),
  },
  {
    id: 'comp-002',
    title: 'Demora excesiva en paradero Av. Alemania',
    description: 'Esperé más de 30 minutos la micro Línea 1C cuando la frecuencia prometida en la aplicación era de 12 minutos.',
    category: ComplaintCategory.DELAY,
    rating: 1,
    status: ComplaintStatus.IN_REVIEW,
    adminResponse: 'En revisión con la central de despacho para verificar telemetry GPS.',
    busId: 'B-1C-01',
    lineName: '1C',
    passengerId: 'usr-pass-01',
    createdAt: new Date(Date.now() - 3600000 * 12), // hace 12 horas
    updatedAt: new Date(Date.now() - 3600000 * 5),
  },
  {
    id: 'comp-003',
    title: 'Frenada brusca y falta de cortesía',
    description: 'El chofer de la Línea 7B frenó de manera violenta cerca de la plaza Aníbal Pinto y trató mal a una persona mayor.',
    category: ComplaintCategory.DRIVER_BEHAVIOR,
    rating: 1,
    status: ComplaintStatus.RESOLVED,
    adminResponse: 'Caso resuelto: Se citó al chofer a capacitación de servicio y se aplicó protocolo de amonestación interna.',
    busId: 'B-7B-01',
    lineName: '7B',
    passengerId: null,
    createdAt: new Date(Date.now() - 3600000 * 24), // hace 24 horas
    updatedAt: new Date(Date.now() - 3600000 * 10),
  },
];

export class ComplaintStore {
  public static async create(data: {
    title: string;
    description: string;
    category: ComplaintCategory;
    rating: number;
    busId?: string;
    lineName?: string;
    passengerId?: string;
  }): Promise<ComplaintRecord> {
    try {
      const dbComplaint = await prisma.complaint.create({
        data: {
          title: data.title,
          description: data.description,
          category: data.category,
          rating: data.rating,
          status: ComplaintStatus.PENDING,
          busId: data.busId,
          passengerId: data.passengerId,
        },
      });
      return {
        ...dbComplaint,
        lineName: data.lineName || null,
        rating: dbComplaint.rating ?? data.rating,
      } as ComplaintRecord;
    } catch {
      // Fallback en memoria
      const newRecord: ComplaintRecord = {
        id: `comp-${uuidv4().substring(0, 8)}`,
        title: data.title,
        description: data.description,
        category: data.category,
        rating: data.rating,
        status: ComplaintStatus.PENDING,
        adminResponse: null,
        busId: data.busId || null,
        lineName: data.lineName || null,
        passengerId: data.passengerId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryComplaints.unshift(newRecord);
      return newRecord;
    }
  }

  public static async listAll(filters?: {
    status?: ComplaintStatus;
    category?: ComplaintCategory;
    busId?: string;
  }): Promise<ComplaintRecord[]> {
    try {
      const where: any = {};
      if (filters?.status) where.status = filters.status;
      if (filters?.category) where.category = filters.category;
      if (filters?.busId) where.busId = filters.busId;

      const dbList = await prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      if (dbList && dbList.length > 0) {
        return dbList.map(c => ({ ...c, lineName: null, rating: c.rating ?? 3 })) as ComplaintRecord[];
      }
    } catch {
      // Fallback a memoria
    }

    return memoryComplaints.filter((c) => {
      if (filters?.status && c.status !== filters.status) return false;
      if (filters?.category && c.category !== filters.category) return false;
      if (filters?.busId && c.busId !== filters.busId) return false;
      return true;
    });
  }

  public static async findById(id: string): Promise<ComplaintRecord | null> {
    try {
      const dbComplaint = await prisma.complaint.findUnique({ where: { id } });
      if (dbComplaint) return { ...dbComplaint, lineName: null, rating: dbComplaint.rating ?? 3 } as ComplaintRecord;
    } catch {
      // Fallback memoria
    }
    return memoryComplaints.find((c) => c.id === id) || null;
  }

  public static async updateStatus(
    id: string,
    status: ComplaintStatus,
    adminResponse?: string
  ): Promise<ComplaintRecord | null> {
    try {
      const dbUpdated = await prisma.complaint.update({
        where: { id },
        data: {
          status,
          ...(adminResponse !== undefined && { adminResponse }),
        },
      });
      return { ...dbUpdated, lineName: null, rating: dbUpdated.rating ?? 3 } as ComplaintRecord;
    } catch {
      // Fallback memoria
      const complaint = memoryComplaints.find((c) => c.id === id);
      if (!complaint) return null;
      complaint.status = status;
      if (adminResponse !== undefined) {
        complaint.adminResponse = adminResponse;
      }
      complaint.updatedAt = new Date();
      return complaint;
    }
  }
}
