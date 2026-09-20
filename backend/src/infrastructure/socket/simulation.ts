import { Server } from 'socket.io';

const TEMUCO_CENTER = { lat: -38.7359, lng: -72.5904 };
export const MAX_BUS_CAPACITY = 35;
export const MIN_BUS_CAPACITY = 0;

export interface SimulatedBus {
  id: string;
  line: '7A' | '7B' | '1C' | string;
  lat: number;
  lng: number;
  status: string;
  capacity: number;
  currentPassengers: number;
  boardings: number;
  schoolBoardings: number;
  alightings: number;
  occupancyPercentage: number;
  isFull: boolean;
  angle: number;
  radius: number;
  speed: number;
  lastEvent?: {
    type: string;
    description: string;
    timestamp: string;
  };
}

/**
 * Algoritmo de cálculo de aforo con validación estricta contra división por cero
 * y cotas rígidas: 0 <= pasajeros <= capacity (35).
 */
export function calculateOccupancy(currentPassengers: number, capacity: number): {
  clampedPassengers: number;
  occupancyPercentage: number;
  isFull: boolean;
} {
  // Cota rígida: nunca menor a MIN_BUS_CAPACITY (0) y nunca mayor a capacity
  const maxCap = Math.max(MIN_BUS_CAPACITY, capacity);
  const clampedPassengers = Math.min(maxCap, Math.max(MIN_BUS_CAPACITY, currentPassengers));

  // Validación robusta contra división por cero
  let occupancyPercentage = 0;
  if (maxCap > 0) {
    occupancyPercentage = Math.round(((clampedPassengers / maxCap) * 100) * 10) / 10;
  }

  return {
    clampedPassengers,
    occupancyPercentage,
    isFull: clampedPassengers >= maxCap,
  };
}

export const buses: SimulatedBus[] = [
  {
    id: 'B-7A-01',
    line: '7A',
    lat: TEMUCO_CENTER.lat,
    lng: TEMUCO_CENTER.lng,
    status: 'En Ruta',
    capacity: MAX_BUS_CAPACITY,
    currentPassengers: 14,
    boardings: 10,
    schoolBoardings: 4,
    alightings: 0,
    occupancyPercentage: 40.0,
    isFull: false,
    angle: 0,
    radius: 0.01,
    speed: 0.08,
  },
  {
    id: 'B-1C-01',
    line: '1C',
    lat: TEMUCO_CENTER.lat,
    lng: TEMUCO_CENTER.lng,
    status: 'En Ruta',
    capacity: MAX_BUS_CAPACITY,
    currentPassengers: 28,
    boardings: 22,
    schoolBoardings: 6,
    alightings: 0,
    occupancyPercentage: 80.0,
    isFull: false,
    angle: Math.PI,
    radius: 0.015,
    speed: 0.06,
  },
  {
    id: 'B-7B-01',
    line: '7B',
    lat: TEMUCO_CENTER.lat,
    lng: TEMUCO_CENTER.lng,
    status: 'En Ruta',
    capacity: MAX_BUS_CAPACITY,
    currentPassengers: 35,
    boardings: 30,
    schoolBoardings: 5,
    alightings: 0,
    occupancyPercentage: 100.0,
    isFull: true,
    angle: Math.PI / 2,
    radius: 0.008,
    speed: 0.09,
  },
];

let socketIoInstance: Server | null = null;

export type SimulationEventType = 
  | 'tap_in_normal'    // Validación tarjeta normal (+1)
  | 'tap_in_student'   // Validación pase escolar (+1)
  | 'sensor_alight'    // Detección cámara descenso (-1)
  | 'fill_capacity'    // Forzar aforo máximo (35)
  | 'empty_capacity';  // Forzar vaciado (0)

export function processSimulationEvent(busId: string, eventType: SimulationEventType): SimulatedBus | null {
  const bus = buses.find((b) => b.id === busId);
  if (!bus) return null;

  const nowIso = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  switch (eventType) {
    case 'tap_in_normal': {
      if (bus.currentPassengers < bus.capacity) {
        bus.currentPassengers++;
        bus.boardings++;
        bus.lastEvent = {
          type: 'CARD_TAP_NORMAL',
          description: '💳 Validación Bip Normal ($700 CLP) - Puerta delantera',
          timestamp: nowIso,
        };
      } else {
        bus.lastEvent = {
          type: 'OVERCROWD_REJECTED',
          description: '⚠️ Intento de ingreso RECHAZADO: Capacidad máxima (35) alcanzada',
          timestamp: nowIso,
        };
      }
      break;
    }

    case 'tap_in_student': {
      if (bus.currentPassengers < bus.capacity) {
        bus.currentPassengers++;
        bus.schoolBoardings++;
        bus.lastEvent = {
          type: 'CARD_TAP_STUDENT',
          description: '🎓 Validación Pase Escolar TNE ($240 CLP) - Puerta delantera',
          timestamp: nowIso,
        };
      } else {
        bus.lastEvent = {
          type: 'OVERCROWD_REJECTED',
          description: '⚠️ Intento de ingreso RECHAZADO: Capacidad máxima (35) alcanzada',
          timestamp: nowIso,
        };
      }
      break;
    }

    case 'sensor_alight': {
      if (bus.currentPassengers > 0) {
        bus.currentPassengers--;
        bus.alightings++;
        bus.lastEvent = {
          type: 'CAMERA_ALIGHT_DETECTED',
          description: '📷 Sensor Cámara: Descenso detectado en puerta trasera (-1)',
          timestamp: nowIso,
        };
      } else {
        bus.lastEvent = {
          type: 'SENSOR_IDLE',
          description: 'ℹ️ Sensor Cámara: No hay pasajeros a bordo para descender',
          timestamp: nowIso,
        };
      }
      break;
    }

    case 'fill_capacity': {
      bus.currentPassengers = bus.capacity;
      bus.boardings += (bus.capacity - bus.currentPassengers);
      bus.lastEvent = {
        type: 'FORCE_FILL',
        description: '⚡ Simulación DevTools: Aforo llevado al límite (35 pasajeros)',
        timestamp: nowIso,
      };
      break;
    }

    case 'empty_capacity': {
      bus.alightings += bus.currentPassengers;
      bus.currentPassengers = 0;
      bus.lastEvent = {
        type: 'FORCE_EMPTY',
        description: '🧹 Simulación DevTools: Bus vaciado (0 pasajeros)',
        timestamp: nowIso,
      };
      break;
    }
  }

  // Recalcular cotas rígidas y porcentaje evitando divisiones por cero
  const { clampedPassengers, occupancyPercentage, isFull } = calculateOccupancy(
    bus.currentPassengers,
    bus.capacity
  );
  bus.currentPassengers = clampedPassengers;
  bus.occupancyPercentage = occupancyPercentage;
  bus.isFull = isFull;
  bus.status = isFull ? 'Completo (35/35)' : 'En Ruta';

  // Si Socket.IO está activo, emitir actualización inmediata
  if (socketIoInstance) {
    socketIoInstance.emit('bus:status:broadcast', {
      ...bus,
      timestamp: new Date().toISOString(),
    });
  }

  return bus;
}

export function startSimulation(io: Server) {
  socketIoInstance = io;
  console.log('🚍 Iniciando simulación de micros para líneas 7A, 7B y 1C con modelo de aforo...');

  // Emitir estado inicial a clientes al iniciar
  buses.forEach((bus) => {
    const { clampedPassengers, occupancyPercentage, isFull } = calculateOccupancy(
      bus.currentPassengers,
      bus.capacity
    );
    bus.currentPassengers = clampedPassengers;
    bus.occupancyPercentage = occupancyPercentage;
    bus.isFull = isFull;
  });

  setInterval(() => {
    buses.forEach((bus) => {
      // Mover el bus circularmente simulando su recorrido
      bus.angle += bus.speed;
      bus.lat = TEMUCO_CENTER.lat + Math.sin(bus.angle) * bus.radius;
      bus.lng = TEMUCO_CENTER.lng + Math.cos(bus.angle) * bus.radius;

      // Recalcular aforo para garantizar coherencia
      const { clampedPassengers, occupancyPercentage, isFull } = calculateOccupancy(
        bus.currentPassengers,
        bus.capacity
      );
      bus.currentPassengers = clampedPassengers;
      bus.occupancyPercentage = occupancyPercentage;
      bus.isFull = isFull;

      // Emitir evento a todos los clientes conectados
      io.emit('bus:location:broadcast', {
        id: bus.id,
        line: bus.line,
        lat: bus.lat,
        lng: bus.lng,
        status: bus.status,
        capacity: bus.capacity,
        currentPassengers: bus.currentPassengers,
        occupancyPercentage: bus.occupancyPercentage,
        boardings: bus.boardings,
        schoolBoardings: bus.schoolBoardings,
        alightings: bus.alightings,
        isFull: bus.isFull,
        lastEvent: bus.lastEvent,
      });
    });
  }, 2000);
}

