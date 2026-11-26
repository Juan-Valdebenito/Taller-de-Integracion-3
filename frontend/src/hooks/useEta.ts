import { useMemo } from 'react';

import type { RouteStop } from '../infrastructure/api/routesApi';
import type { BusState } from './useSimulatedBuses';

export interface StopEta {
  stopId: string;
  stopName: string;
  distanceM: number;
  etaSeconds: number | null;
  etaLabel: string;
  position: [number, number];
}

export interface BusEtaResult {
  nextStop: StopEta | null;
  allStops: StopEta[];
  isStopped: boolean;
}

const TORTUOSITY = 1.35;

function distanceInMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isAhead(bus: Pick<BusState, 'latitude' | 'longitude' | 'heading'>, [stopLat, stopLng]: [number, number]): boolean {
  const heading = bus.heading * Math.PI / 180;
  const dLat = stopLat - bus.latitude;
  const dLng = stopLng - bus.longitude;
  const magnitude = Math.hypot(dLat, dLng);
  if (magnitude < 1e-9) return false;
  return Math.sin(heading) * dLng / magnitude + Math.cos(heading) * dLat / magnitude > 0;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seg`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

/** ETA calculado con paraderos asociados a la ruta por el backend. */
export function computeEta(bus: BusState | null | undefined, routeStops: readonly RouteStop[] = []): BusEtaResult {
  const isStopped = Boolean(bus && (bus.speed <= 1 || bus.status === 'STOPPED'));
  if (!bus || routeStops.length === 0) return { nextStop: null, allStops: [], isStopped };

  const speedMs = bus.speed / 3.6;
  const allStops = routeStops
    .filter((stop) => (
      Number.isFinite(stop.latitude)
      && Number.isFinite(stop.longitude)
      && stop.latitude >= -90
      && stop.latitude <= 90
      && stop.longitude >= -180
      && stop.longitude <= 180
    ))
    .map((stop): StopEta => {
      const position: [number, number] = [stop.latitude, stop.longitude];
      const distanceM = distanceInMeters(bus, stop) * TORTUOSITY;
      const etaSeconds = !isStopped && speedMs > 0 ? distanceM / speedMs : null;
      return {
        stopId: stop.id,
        stopName: stop.name,
        distanceM,
        etaSeconds,
        etaLabel: etaSeconds === null ? '—' : formatEta(etaSeconds),
        position,
      };
    });

  const ahead = allStops.filter((stop) => isAhead(bus, stop.position));
  const candidates = ahead.length > 0 ? ahead : allStops;
  const nextStop = candidates.reduce<StopEta | null>(
    (closest, stop) => (!closest || stop.distanceM < closest.distanceM ? stop : closest),
    null,
  );
  return { nextStop, allStops, isStopped };
}

export function useEta(bus: BusState | null | undefined, routeStops: readonly RouteStop[] = []): BusEtaResult {
  return useMemo(() => computeEta(bus, routeStops), [bus, routeStops]);
}

export function useNextStopEtaLabel(bus: BusState | null | undefined, routeStops: readonly RouteStop[] = []): string | null {
  const { nextStop, isStopped } = useEta(bus, routeStops);
  if (isStopped) return null;
  return nextStop?.etaLabel ?? null;
}
