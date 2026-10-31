/**
 * Avance del recorrido en el modo conductor (funciones puras). El web calcula
 * el progreso con los minutos transcurridos sobre una duración fija; aquí sale
 * de la posición real de la micro: un paradero queda pasado cuando la micro
 * llega a menos de ARRIVAL_RADIUS_M de él, en el orden del recorrido.
 */
import type { RouteStop } from '../api/companyApi';
import { distanceInMeters, type Coordinates } from '../location/geo';

/** Distancia (m) a la que se considera que la micro llegó a un paradero. */
export const ARRIVAL_RADIUS_M = 60;

/**
 * Último paradero alcanzado (índice; -1 = ninguno todavía) tras una nueva
 * posición. Solo avanza: se busca entre los paraderos que faltan el primero
 * al que la micro está llegando, así un salto del GPS no la hace retroceder y
 * si se saltó un paradero (sin pasar cerca) igual avanza al siguiente.
 */
export function advanceReached(
  reached: number,
  stops: readonly Pick<RouteStop, 'latitude' | 'longitude'>[],
  position: Coordinates | null,
  radiusM: number = ARRIVAL_RADIUS_M,
): number {
  if (!position) return reached;
  for (let i = stops.length - 1; i > reached; i--) {
    if (distanceInMeters(position, stops[i]) <= radiusM) return i;
  }
  return reached;
}

export interface TripProgress {
  /** 0 a 100. */
  percent: number;
  /** Índice de la próxima parada; null si ya se pasó la última (o no hay paraderos). */
  nextIndex: number | null;
  /** true si el paradero ya quedó atrás (para resaltarlo, como .is-passed del web). */
  isPassed: (index: number) => boolean;
}

export function tripProgress(reached: number, stopCount: number): TripProgress {
  if (stopCount === 0) return { percent: 0, nextIndex: null, isPassed: () => false };
  const passed = Math.min(Math.max(reached + 1, 0), stopCount);
  return {
    percent: Math.round((passed / stopCount) * 100),
    nextIndex: passed < stopCount ? passed : null,
    isPassed: (index) => index <= reached,
  };
}

/** Minutos enteros desde el inicio del recorrido. */
export const elapsedMinutes = (startedAt: number, now: number) => Math.max(0, Math.floor((now - startedAt) / 60_000));
