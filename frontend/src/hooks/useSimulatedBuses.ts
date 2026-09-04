/**
 * useSimulatedBuses.ts
 *
 * Hook que genera y mueve micros simuladas por coordenadas reales de Temuco.
 * Funciona completamente en el frontend sin necesidad del backend.
 * El hook exporta el estado `buses` que se actualiza cada 2 segundos.
 */

import { useEffect, useRef, useState } from 'react';

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
  status: 'ACTIVE' | 'STOPPED' | 'DELAYED';
  lastUpdate: Date;
}

// ─── Rutas simuladas en Temuco ────────────────────────────────────────────────

const ROUTES: Record<string, { name: string; waypoints: [number, number][] }> = {
  'route-1': {
    name: 'Ruta 1 — Centro / Hospital',
    // Plaza de Armas → Av. Caupolicán → Hospital
    waypoints: [
      [-38.7359, -72.5904], // Plaza de Armas
      [-38.7390, -72.5920],
      [-38.7420, -72.5935],
      [-38.7450, -72.5960],
      [-38.7479, -72.5971], // Terminal Rodoviario
      [-38.7510, -72.5990],
      [-38.7540, -72.6010],
    ],
  },
  'route-3': {
    name: 'Ruta 3 — Amanecer / Costanera',
    // Mall Mirage → Av. Alemania → Costanera
    waypoints: [
      [-38.7280, -72.6100], // Sector Norte
      [-38.7320, -72.6050],
      [-38.7359, -72.5904], // Plaza
      [-38.7400, -72.5850],
      [-38.7440, -72.5800],
      [-38.7480, -72.5750],
      [-38.7520, -72.5700], // Sector Sur
    ],
  },
};

// ─── Micros iniciales ─────────────────────────────────────────────────────────

const INITIAL_BUSES: BusState[] = [
  {
    id: 'BUS-101',
    routeId: 'route-1',
    routeName: ROUTES['route-1'].name,
    latitude: -38.7359,
    longitude: -72.5904,
    heading: 180,
    speed: 35,
    currentPassengers: 20,
    capacity: 80,
    status: 'ACTIVE',
    lastUpdate: new Date(),
  },
  {
    id: 'BUS-102',
    routeId: 'route-1',
    routeName: ROUTES['route-1'].name,
    latitude: -38.7479,
    longitude: -72.5971,
    heading: 0,
    speed: 28,
    currentPassengers: 65,
    capacity: 80,
    status: 'ACTIVE',
    lastUpdate: new Date(),
  },
  {
    id: 'BUS-103',
    routeId: 'route-3',
    routeName: ROUTES['route-3'].name,
    latitude: -38.7280,
    longitude: -72.6100,
    heading: 135,
    speed: 40,
    currentPassengers: 42,
    capacity: 80,
    status: 'ACTIVE',
    lastUpdate: new Date(),
  },
  {
    id: 'BUS-104',
    routeId: 'route-3',
    routeName: ROUTES['route-3'].name,
    latitude: -38.7440,
    longitude: -72.5800,
    heading: 315,
    speed: 0,
    currentPassengers: 78,
    capacity: 80,
    status: 'STOPPED',
    lastUpdate: new Date(),
  },
  {
    id: 'BUS-105',
    routeId: 'route-1',
    routeName: ROUTES['route-1'].name,
    latitude: -38.7420,
    longitude: -72.5935,
    heading: 200,
    speed: 15,
    currentPassengers: 55,
    capacity: 80,
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
