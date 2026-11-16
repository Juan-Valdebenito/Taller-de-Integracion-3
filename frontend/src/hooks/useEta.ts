import { BusState } from './useSimulatedBuses';

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

export function useEta(bus: BusState | null | undefined): BusEtaResult {
  return {
    nextStop: null,
    allStops: [],
    isStopped: Boolean(bus && (bus.speed <= 1 || bus.status === 'STOPPED')),
  };
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
