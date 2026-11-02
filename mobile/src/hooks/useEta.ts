import { useMemo } from 'react';

import { ROUTE_NODES, type RouteId } from '../components/map/routeNodes';
import { distanceInMeters } from '../location/geo';
import type { LiveBus } from '../realtime/liveBuses';

/**
 * Tiempo de llegada (ETA) de una micro a los paraderos de su línea, igual que
 * useEta del web: distancia en línea recta × 1,35 (las calles no son rectas)
 * dividida por la velocidad actual. El próximo paradero es el más cercano
 * que queda por delante según el rumbo de la micro.
 */

/** Distancia por calle ≈ distancia en línea recta × 1,35 (factor del web para Temuco). */
export const TORTUOSITY = 1.35;

/** Bajo esta velocidad (km/h) la micro se considera detenida y no hay ETA. */
export const MIN_SPEED_KMH = 1;

export interface StopEta {
  stopId: string;
  stopName: string;
  /** Metros, ya multiplicados por TORTUOSITY. */
  distanceM: number;
  /** null si la micro está detenida. */
  etaSeconds: number | null;
  /** "45 seg", "4 min", "1 h 5 min" o "—". */
  etaLabel: string;
  position: [number, number];
}

export interface BusEtaResult {
  nextStop: StopEta | null;
  allStops: StopEta[];
  isStopped: boolean;
}

/** Texto del ETA, como el web: "45 seg", "4 min", "1 h 5 min", "2 h". */
export function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seg`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** true si el paradero queda a menos de 90° del rumbo de la micro (aproximación plana). */
export function isAhead(bus: Pick<LiveBus, 'latitude' | 'longitude' | 'heading'>, [stopLat, stopLng]: [number, number]): boolean {
  const headRad = (bus.heading * Math.PI) / 180;
  const dLat = stopLat - bus.latitude;
  const dLng = stopLng - bus.longitude;
  const mag = Math.sqrt(dLat ** 2 + dLng ** 2);
  if (mag < 1e-9) return false;
  return Math.sin(headRad) * (dLng / mag) + Math.cos(headRad) * (dLat / mag) > 0;
}

export function computeEta(bus: LiveBus | null | undefined): BusEtaResult {
  if (!bus) return { nextStop: null, allStops: [], isStopped: false };

  const isStopped = bus.speed <= MIN_SPEED_KMH || bus.status === 'STOPPED';
  const routeStops = ROUTE_NODES.filter((node) => node.routeIds.includes(bus.routeId as RouteId));
  if (routeStops.length === 0) return { nextStop: null, allStops: [], isStopped };

  const speedMs = bus.speed / 3.6;
  const allStops: StopEta[] = routeStops.map((stop) => {
    const distanceM = distanceInMeters(bus, { latitude: stop.position[0], longitude: stop.position[1] }) * TORTUOSITY;
    const etaSeconds = !isStopped && speedMs > 0 ? distanceM / speedMs : null;
    return {
      stopId: stop.id,
      stopName: stop.name,
      distanceM,
      etaSeconds,
      etaLabel: etaSeconds === null ? '—' : formatEta(etaSeconds),
      position: stop.position,
    };
  });

  // Si ninguno queda por delante (p. ej. sin rumbo), se usa el más cercano.
  const ahead = allStops.filter((stop) => isAhead(bus, stop.position));
  const candidates = ahead.length > 0 ? ahead : allStops;
  const nextStop = candidates.reduce<StopEta | null>((closest, stop) => (!closest || stop.distanceM < closest.distanceM ? stop : closest), null);

  return { nextStop, allStops, isStopped };
}

export function useEta(bus: LiveBus | null | undefined): BusEtaResult {
  return useMemo(() => computeEta(bus), [bus]);
}
