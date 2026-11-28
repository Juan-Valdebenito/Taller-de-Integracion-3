/**
 * useSimulatedBuses.ts
 *
 * Tipo de una micro en el mapa y colores según su ocupación. El archivo conserva
 * su nombre porque lo importan varios componentes, pero ya no simula: las micros
 * llegan siempre por el WebSocket (la simulación, si se usa, corre en backend-go).
 */

import type { OccupancyInfo } from '../infrastructure/socket/socketClient';

export type OccupancyLevel = 'low' | 'medium' | 'high' | 'full';

export interface BusState {
  id: string;
  routeId: string;
  routeName: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  currentPassengers: number;
  capacity: number;
  boardings?: number;
  alightings?: number;
  studentBoardings?: number;
  rejectedBoardings?: number;
  totalBoardings?: number;
  totalAlightings?: number;
  totalStudents?: number;
  status: 'ACTIVE' | 'STOPPED' | 'DELAYED';
  lastUpdate: Date;
  /** Datos de predicción de ocupación del WebSocket (backend Go). */
  wsOccupancy?: OccupancyInfo;
  /** Timestamp del último update recibido vía WebSocket. */
  lastWsUpdate?: Date;
  /** Distingue eventos de conductores de la simulación de respaldo. */
  dataSource: 'live' | 'simulation';
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Devuelve el nivel de ocupación según el porcentaje */
export function getOccupancyLevel(current: number, capacity: number): OccupancyLevel {
  const ratio = current / capacity;
  if (ratio < 0.5) return 'low';
  if (ratio < 0.75) return 'medium';
  if (ratio < 0.9) return 'high';
  return 'full';
}

/** Color hexadecimal según nivel de ocupación */
export function getOccupancyColor(level: OccupancyLevel): string {
  switch (level) {
    case 'low':    return '#22c55e'; // verde
    case 'medium': return '#f59e0b'; // amarillo
    case 'high':   return '#f97316'; // naranja
    case 'full':   return '#ef4444'; // rojo
  }
}
