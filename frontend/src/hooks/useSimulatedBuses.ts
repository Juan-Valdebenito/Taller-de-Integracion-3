/**
 * useSimulatedBuses.ts
 *
 * Hook que genera y mueve micros simuladas por coordenadas reales de Temuco.
 * Funciona completamente en el frontend sin necesidad del backend.
 * El hook exporta el estado `buses` que se actualiza cada 2 segundos.
 */

import { useEffect, useRef, useState } from 'react';
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
}

// ─── Rutas simuladas en Temuco ────────────────────────────────────────────────

const ROUTES: Record<string, { name: string; waypoints: [number, number][] }> = {
  'route-7A': {
    name: 'Línea 7A — Hualpén / Centro / Las Américas',
    waypoints: [
      [-38.7278, -72.6175],
      [-38.7335, -72.5900],
      [-38.7359, -72.5904],
      [-38.7445, -72.5670],
      [-38.7490, -72.5608],
      [-38.7386, -72.5815],
      [-38.7285, -72.6155],
    ],
  },
  'route-7B': {
    name: 'Línea 7B — Pedro de Valdivia / Centro / Amanecer',
    waypoints: [
      [-38.7085, -72.5820],
      [-38.7188, -72.5837],
      [-38.7358, -72.5904],
      [-38.7482, -72.5928],
      [-38.7508, -72.5932],
      [-38.7382, -72.5910],
      [-38.7092, -72.5822],
    ],
  },
  'route-1C': {
    name: 'Línea 1C — Padre Las Casas / Centro / Labranza',
    waypoints: [
      [-38.7775, -72.5692],
      [-38.7632, -72.5758],
      [-38.7360, -72.5906],
      [-38.7410, -72.6288],
      [-38.7395, -72.6225],
      [-38.7532, -72.5830],
      [-38.7775, -72.5692],
    ],
  },
};

// ─── Micros iniciales ─────────────────────────────────────────────────────────

const INITIAL_BUSES: BusState[] = [
  {
    id: 'sim-route-7A-1',
    routeId: 'route-7A',
    routeName: ROUTES['route-7A'].name,
    latitude: ROUTES['route-7A'].waypoints[0][0],
    longitude: ROUTES['route-7A'].waypoints[0][1],
    heading: 180,
    speed: 35,
    currentPassengers: 18,
    capacity: 45,
    status: 'ACTIVE',
    lastUpdate: new Date(),
  },
  {
    id: 'sim-route-7B-1',
    routeId: 'route-7B',
    routeName: ROUTES['route-7B'].name,
    latitude: ROUTES['route-7B'].waypoints[0][0],
    longitude: ROUTES['route-7B'].waypoints[0][1],
    heading: 0,
    speed: 28,
    currentPassengers: 27,
    capacity: 45,
    status: 'ACTIVE',
    lastUpdate: new Date(),
  },
  {
    id: 'sim-route-1C-1',
    routeId: 'route-1C',
    routeName: ROUTES['route-1C'].name,
    latitude: ROUTES['route-1C'].waypoints[0][0],
    longitude: ROUTES['route-1C'].waypoints[0][1],
    heading: 135,
    speed: 40,
    currentPassengers: 22,
    capacity: 40,
    status: 'DELAYED',
    lastUpdate: new Date(),
  },
];

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

/** Mueve una coordenada aleatoriamente ~50–150m */
function nudge(val: number, maxDelta = 0.0012): number {
  const delta = (Math.random() - 0.5) * 2 * maxDelta;
  return val + delta;
}

/** Limites aproximados de Temuco para no salir del mapa */
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

const TEMUCO_BOUNDS = {
  latMin: -38.80, latMax: -38.70,
  lngMin: -72.65, lngMax: -72.55,
};

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useSimulatedBuses(intervalMs = 2000) {
  const [buses, setBuses] = useState<BusState[]>(INITIAL_BUSES);
  const busesRef = useRef<BusState[]>(INITIAL_BUSES);

  useEffect(() => {
    const timer = setInterval(() => {
      busesRef.current = busesRef.current.map((bus) => {
        // Micros detenidas tienen probabilidad de arrancar
        if (bus.status === 'STOPPED' && Math.random() < 0.2) {
          return { ...bus, status: 'ACTIVE', speed: 20 + Math.random() * 25 };
        }
        // Variación de pasajeros (±1–3 por parada simulada)
        const passengerDelta = Math.floor((Math.random() - 0.4) * 4);
        const newPassengers = clamp(bus.currentPassengers + passengerDelta, 0, bus.capacity);

        // Movimiento aleatorio dentro de Temuco
        const newLat = clamp(nudge(bus.latitude), TEMUCO_BOUNDS.latMin, TEMUCO_BOUNDS.latMax);
        const newLng = clamp(nudge(bus.longitude), TEMUCO_BOUNDS.lngMin, TEMUCO_BOUNDS.lngMax);

        // Heading hacia donde se mueve
        const dLat = newLat - bus.latitude;
        const dLng = newLng - bus.longitude;
        const heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;

        return {
          ...bus,
          latitude: newLat,
          longitude: newLng,
          heading,
          speed: bus.status === 'STOPPED' ? 0 : 15 + Math.random() * 40,
          currentPassengers: newPassengers,
          lastUpdate: new Date(),
        };
      });

      setBuses([...busesRef.current]);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return buses;
}
