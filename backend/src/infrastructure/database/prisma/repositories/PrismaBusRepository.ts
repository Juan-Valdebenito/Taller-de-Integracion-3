import { prisma } from '../client';
import { Bus, GeoLocation } from '../../../../domain/entities/Bus';
import { IBusRepository } from '../../../../domain/repositories/IBusRepository';
import { BusStatus } from '../../../../shared/enums';

// ── Tipos internos de Prisma para el modelo Bus ────────────────────────────────

type PrismaBusRecord = {
  id: string;
  patente: string;
  capacity: number;
  currentPassengers: number;
  boardings: number;
  alightings: number;
  schoolBoardings: number;
  status: string;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastHeading: number | null;
  lastSpeed: number | null;
  lastLocationAt: Date | null;
  companyId: string;
  routeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ── Mapper: Prisma record → Entidad de dominio ─────────────────────────────────

function toEntity(raw: PrismaBusRecord): Bus {
  // Reconstruye GeoLocation solo si hay coordenadas persistidas
  const currentLocation: GeoLocation | null =
    raw.lastLatitude !== null && raw.lastLongitude !== null && raw.lastLocationAt !== null
      ? {
          latitude: raw.lastLatitude,
          longitude: raw.lastLongitude,
          heading: raw.lastHeading ?? undefined,
          speed: raw.lastSpeed ?? undefined,
          timestamp: raw.lastLocationAt,
        }
      : null;

  return new Bus(
    raw.id,
    raw.patente,
    raw.capacity,
    raw.currentPassengers,
    raw.boardings,
    raw.alightings,
    raw.schoolBoardings,
    raw.status as BusStatus,
    raw.routeId,
    raw.companyId,
    currentLocation,
    raw.createdAt,
    raw.updatedAt,
  );
}

// ── Implementación del repositorio ─────────────────────────────────────────────

export class PrismaBusRepository implements IBusRepository {

  /** Retorna todos los buses de la BD, ordenados por patente. */
  async findAll(): Promise<Bus[]> {
    const rows = await prisma.bus.findMany({
      orderBy: { patente: 'asc' },
    });
    return rows.map(toEntity);
  }

  /** Retorna un bus por su ID, o null si no existe. */
  async findById(id: string): Promise<Bus | null> {
    const row = await prisma.bus.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  /** Retorna todos los buses asignados a una ruta específica. */
  async findByRouteId(routeId: string): Promise<Bus[]> {
    const rows = await prisma.bus.findMany({
      where: { routeId },
      orderBy: { patente: 'asc' },
    });
    return rows.map(toEntity);
  }

  /** Retorna todos los buses pertenecientes a una empresa. */
  async findByCompanyId(companyId: string): Promise<Bus[]> {
    const rows = await prisma.bus.findMany({
      where: { companyId },
      orderBy: { patente: 'asc' },
    });
    return rows.map(toEntity);
  }

  /** Retorna los buses ACTIVOS asignados a una ruta (para el mapa en tiempo real). */
  async findActiveByRouteId(routeId: string): Promise<Bus[]> {
    const rows = await prisma.bus.findMany({
      where: {
        routeId,
        status: BusStatus.ACTIVE,
      },
      orderBy: { patente: 'asc' },
    });
    return rows.map(toEntity);
  }

  /** Crea un nuevo bus en la BD y retorna la entidad creada. */
  async create(data: Omit<Bus, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bus> {
    const row = await prisma.bus.create({
      data: {
        patente:           data.patente,
        capacity:          data.capacity,
        currentPassengers: data.currentPassengers,
        boardings:         data.boardings,
        alightings:        data.alightings,
        schoolBoardings:   data.schoolBoardings,
        status:            data.status,
        companyId:         data.companyId,
        routeId:           data.routeId ?? undefined,
        // Ubicación inicial (normalmente null al crear)
        lastLatitude:   data.currentLocation?.latitude   ?? undefined,
        lastLongitude:  data.currentLocation?.longitude  ?? undefined,
        lastHeading:    data.currentLocation?.heading    ?? undefined,
        lastSpeed:      data.currentLocation?.speed      ?? undefined,
        lastLocationAt: data.currentLocation?.timestamp  ?? undefined,
      },
    });
    return toEntity(row);
  }

  /**
   * Actualiza los campos proporcionados de un bus.
   * Solo actualiza los campos presentes en `data` (patch parcial).
   */
  async update(id: string, data: Partial<Bus>): Promise<Bus> {
    const row = await prisma.bus.update({
      where: { id },
      data: {
        ...(data.patente           !== undefined && { patente:           data.patente }),
        ...(data.capacity          !== undefined && { capacity:          data.capacity }),
        ...(data.currentPassengers !== undefined && { currentPassengers: data.currentPassengers }),
        ...(data.boardings         !== undefined && { boardings:         data.boardings }),
        ...(data.alightings        !== undefined && { alightings:        data.alightings }),
        ...(data.schoolBoardings   !== undefined && { schoolBoardings:   data.schoolBoardings }),
        ...(data.status            !== undefined && { status:            data.status }),
        ...(data.routeId           !== undefined && { routeId:           data.routeId }),
        // Actualización de ubicación vía patch general
        ...(data.currentLocation !== undefined && data.currentLocation !== null && {
          lastLatitude:   data.currentLocation.latitude,
          lastLongitude:  data.currentLocation.longitude,
          lastHeading:    data.currentLocation.heading   ?? null,
          lastSpeed:      data.currentLocation.speed     ?? null,
          lastLocationAt: data.currentLocation.timestamp,
        }),
      },
    });
    return toEntity(row);
  }

  /**
   * Actualiza únicamente los campos de ubicación GPS del bus.
   * Diseñado para ser llamado desde el handler de Socket.IO en tiempo real.
   */
  async updateLocation(id: string, location: GeoLocation): Promise<void> {
    await prisma.bus.update({
      where: { id },
      data: {
        lastLatitude:   location.latitude,
        lastLongitude:  location.longitude,
        lastHeading:    location.heading    ?? null,
        lastSpeed:      location.speed      ?? null,
        lastLocationAt: location.timestamp,
      },
    });
  }

  /** Elimina un bus por ID. Lanza error de Prisma si no existe. */
  async delete(id: string): Promise<void> {
    await prisma.bus.delete({ where: { id } });
  }
}
