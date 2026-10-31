/**
 * Colores de estado de las micros y de su ocupación, iguales al frontend web
 * (frontend/src/hooks/useSimulatedBuses.ts y components/map/BusSidePanel.tsx).
 * No cambian con el tema: el web los usa igual sobre cualquier fondo.
 */

export type OccupancyLevel = 'low' | 'medium' | 'high' | 'full';

export const OCCUPANCY_COLORS: Readonly<Record<OccupancyLevel, string>> = Object.freeze({
  low: '#22c55e', // verde
  medium: '#f59e0b', // amarillo
  high: '#f97316', // naranja
  full: '#ef4444', // rojo
});

/** Nivel de ocupación según pasajeros / capacidad (mismos cortes que el web). */
export function occupancyLevel(current: number, capacity: number): OccupancyLevel {
  const ratio = capacity > 0 ? current / capacity : 1;
  if (ratio < 0.5) return 'low';
  if (ratio < 0.75) return 'medium';
  if (ratio < 0.9) return 'high';
  return 'full';
}

export function occupancyColor(current: number, capacity: number): string {
  return OCCUPANCY_COLORS[occupancyLevel(current, capacity)];
}

export type BusStatus = 'ACTIVE' | 'STOPPED' | 'DELAYED';

/** Etiqueta y color del punto de estado de cada micro. */
export const BUS_STATUS: Readonly<Record<BusStatus, { label: string; color: string }>> = Object.freeze({
  ACTIVE: { label: 'En ruta', color: '#22c55e' },
  STOPPED: { label: 'Detenido', color: '#f59e0b' },
  DELAYED: { label: 'Retrasado', color: '#ef4444' },
});

/** Degradado de la marca "TransitHub" (--color-primary-400 → --color-primary-200). */
export const BRAND_GRADIENT = ['#2b7cee', '#88b8fc'] as const;
