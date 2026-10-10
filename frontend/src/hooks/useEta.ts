/**
 * useEta.ts
 *
 * Calcula el ETA (Estimated Time of Arrival) al próximo paradero de la ruta
 * usando los datos de velocidad y posición que llegan en tiempo real por WS.
 *
 * Fórmula:
 *   distancia_m = haversine(bus.lat, bus.lng, parada.lat, parada.lng)
 *   ETA_s       = (distancia_m * TORTUOSITY) / (speed_ms)
 *
 * Donde:
 *   - TORTUOSITY = 1.35  — factor empírico de tortuosidad en trama urbana de Temuco
 *   - speed_ms          — velocidad del bus en m/s (convertida desde km/h del WS)
 *
 * Si el bus está detenido (speed ≤ 1 km/h) se devuelve null para no mostrar ETA.
 */

import { useMemo } from 'react';
import { BusState } from './useSimulatedBuses';
import { ROUTE_NODES, RouteNode } from '../presentation/components/map/routeNodes';

// ── Constantes ────────────────────────────────────────────────────────────────

/** Factor de tortuosidad urbana: distancia real ≈ distancia aérea × 1.35 */
const TORTUOSITY = 1.35;

/** Velocidad mínima para considerar el bus en movimiento (km/h) */
const MIN_SPEED_KMH = 1;

/** Radio de la Tierra en metros */
const EARTH_RADIUS_M = 6_371_000;

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface StopEta {
  /** ID del paradero (ej: 'PAR-MRODRI-01') */
  stopId: string;
  /** Nombre del paradero */
  stopName: string;
  /** Distancia en metros (línea recta × tortuosidad) */
  distanceM: number;
  /** ETA en segundos (null si el bus está parado) */
  etaSeconds: number | null;
  /** Texto formateado para mostrar en UI: "2 min", "45 seg", "~10 min" */
  etaLabel: string;
  /** Coordenadas del paradero */
  position: [number, number];
}

export interface BusEtaResult {
  /** Próximo paradero (más cercano por delante de la ruta) */
  nextStop: StopEta | null;
  /** Todos los paraderos de la ruta con ETA calculado */
  allStops: StopEta[];
  /** true si el bus está detenido y no se puede calcular ETA fiable */
  isStopped: boolean;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Calcula la distancia geodésica entre dos puntos (fórmula Haversine).
 * @returns Distancia en metros
 */
function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Formatea segundos a texto legible:
 *   < 60s  → "45 seg"
 *   < 3600s → "4 min" / "~10 min"
 *   >= 3600s → "1 h 5 min"
 */
function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seg`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Calcula si el paradero está "por delante" del bus según su heading.
 * Usa el producto escalar del vector de desplazamiento y el vector de heading.
 * Devuelve true si el ángulo entre ambos vectores es < 90°.
 */
function isAhead(
  busLat: number, busLng: number, heading: number,
  stopLat: number, stopLng: number,
): boolean {
  // Vector de dirección del bus (en radianes)
  const headRad = (heading * Math.PI) / 180;
  const busDir = { x: Math.sin(headRad), y: Math.cos(headRad) };

  // Vector bus → parada (aproximación plana válida a escala urbana)
  const dLat = stopLat - busLat;
  const dLng = stopLng - busLng;
  const mag = Math.sqrt(dLat ** 2 + dLng ** 2);
  if (mag < 1e-9) return false;
  const toStop = { x: dLng / mag, y: dLat / mag };

  // Producto escalar > 0 → ángulo < 90° → paradero está por delante
  return busDir.x * toStop.x + busDir.y * toStop.y > 0;
}

// ── Hook principal ────────────────────────────────────────────────────────────

/**
 * Calcula ETA en tiempo real para todos los paraderos de la ruta del bus dado.
 *
 * @param bus — Estado actual del bus (lat, lng, speed, heading, routeId)
 * @returns BusEtaResult con el próximo paradero y todos los paraderos de la ruta
 *
 * @example
 * ```tsx
 * const { nextStop, isStopped } = useEta(bus);
 * if (!isStopped && nextStop) {
 *   return <span>Próxima parada: {nextStop.stopName} — {nextStop.etaLabel}</span>;
 * }
 * ```
 */
export function useEta(bus: BusState | null | undefined): BusEtaResult {
  return useMemo(() => {
    const empty: BusEtaResult = { nextStop: null, allStops: [], isStopped: false };
    if (!bus) return empty;

    const isStopped = bus.speed <= MIN_SPEED_KMH || bus.status === 'STOPPED';

    // Filtrar solo paraderos de la ruta del bus
    type RouteId = 'route-7A' | 'route-7B' | 'route-1C';
    const routeStops: RouteNode[] = ROUTE_NODES.filter((n) =>
      n.routeIds.includes(bus.routeId as RouteId),
    );

    if (routeStops.length === 0) return { ...empty, isStopped };

    // Velocidad en m/s
    const speedMs = (bus.speed / 3.6); // km/h → m/s

    const allStops: StopEta[] = routeStops.map((stop) => {
      const straightM = haversineM(
        bus.latitude, bus.longitude,
        stop.position[0], stop.position[1],
      );
      // Distancia ajustada por tortuosidad urbana
      const distanceM = straightM * TORTUOSITY;

      let etaSeconds: number | null = null;
      let etaLabel = '—';

      if (!isStopped && speedMs > 0) {
        etaSeconds = distanceM / speedMs;
        etaLabel = formatEta(etaSeconds);
      }

      return {
        stopId: stop.id,
        stopName: stop.name,
        distanceM,
        etaSeconds,
        etaLabel,
        position: stop.position,
      };
    });

    // Próximo paradero: el más cercano que esté "por delante" del bus
    const aheadStops = allStops.filter((s) =>
      isAhead(bus.latitude, bus.longitude, bus.heading, s.position[0], s.position[1]),
    );

    // Si ninguno está por delante (ej. heading desconocido), usar el más cercano
    const candidates = aheadStops.length > 0 ? aheadStops : allStops;
    const nextStop = candidates.reduce<StopEta | null>((closest, s) => {
      if (!closest) return s;
      return s.distanceM < closest.distanceM ? s : closest;
    }, null);

    return { nextStop, allStops, isStopped };
  }, [bus]);
}

/**
 * Versión simplificada: devuelve solo el label del próximo paradero.
 * Útil para badges inline en listas de buses.
 */
export function useNextStopEtaLabel(bus: BusState | null | undefined): string | null {
  const { nextStop, isStopped } = useEta(bus);
  if (isStopped) return null;
  if (!nextStop) return null;
  return nextStop.etaLabel;
}
