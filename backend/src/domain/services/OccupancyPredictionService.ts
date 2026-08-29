import { OccupancyLevel } from '../../shared/enums';

// ─── Tipos de entrada y salida ───────────────────────────────────────────────

/**
 * Datos de entrada para la predicción de ocupación.
 */
export interface PredictionInput {
  currentPassengers: number; // Pasajeros actuales en el bus
  capacity: number;          // Capacidad máxima del bus
  routeId?: string;          // ID de la ruta (para futuro modelo ML)
  hour?: number;             // Hora del día 0–23 (default: hora actual del sistema)
  dayOfWeek?: number;        // Día de la semana 0=Dom … 6=Sáb (default: hoy)
}

/**
 * Resultado de la predicción de ocupación.
 */
export interface PredictionResult {
  predictedOccupancyRatio: number; // Proporción proyectada 0.0–1.0
  predictedPassengers: number;     // Pasajeros proyectados (entero)
  occupancyLevel: OccupancyLevel;  // LOW | MEDIUM | HIGH | FULL
  occupancyText: string;           // Texto legible con emoji
  occupancyColor: string;          // Color hex para el frontend
  confidence: number;              // Confianza de la predicción 0.0–1.0
  isSimulated: boolean;            // true mientras no hay modelo ML real
  predictedAt: string;             // ISO timestamp del momento de la predicción
}

// ─── Constantes internas ─────────────────────────────────────────────────────

/** Franjas horarias punta en Chile (hora local) */
const PEAK_HOURS: ReadonlyArray<{ start: number; end: number; multiplier: number }> = [
  { start: 7,  end: 9,  multiplier: 1.30 }, // Mañana
  { start: 12, end: 14, multiplier: 1.15 }, // Mediodía
  { start: 17, end: 19, multiplier: 1.35 }, // Tarde (hora punta principal)
];

/** Multiplicador por día de la semana (0=Dom … 6=Sáb) */
const DAY_MULTIPLIERS: Record<number, number> = {
  0: 0.65, // Domingo
  1: 1.00, // Lunes
  2: 1.00, // Martes
  3: 0.95, // Miércoles
  4: 1.00, // Jueves
  5: 0.90, // Viernes (algunos trabajan desde casa)
  6: 0.60, // Sábado
};

/** Variación aleatoria máxima (±10%) para simular incertidumbre del modelo */
const NOISE_FACTOR = 0.10;

/** Confianza base simulada (el modelo ML real tendrá la suya propia) */
const SIMULATED_CONFIDENCE = 0.75;

// ─── Servicio ────────────────────────────────────────────────────────────────

/**
 * Servicio de dominio: Predicción simulada de nivel de ocupación.
 *
 * Usa heurísticas de hora punta y día de semana para estimar cómo
 * evolucionará la ocupación de una micro en el próximo tramo.
 *
 * @remarks
 * **Punto de migración al clúster ML:**
 * Cuando estén disponibles las credenciales del clúster, solo reemplazar
 * el cuerpo del método `predict()` por la llamada HTTP al modelo real.
 * La firma del método, el endpoint REST y los tests no cambian.
 */
export class OccupancyPredictionService {

  /**
   * Determina el nivel de ocupación según la proporción de pasajeros.
   *
   * @param ratio - Proporción de ocupación (0.0–1.0)
   * @returns OccupancyLevel correspondiente
   */
  static getOccupancyLevel(ratio: number): OccupancyLevel {
    if (ratio < 0.4) return OccupancyLevel.LOW;
    if (ratio < 0.7) return OccupancyLevel.MEDIUM;
    if (ratio < 0.9) return OccupancyLevel.HIGH;
    return OccupancyLevel.FULL;
  }

  /**
   * Texto descriptivo con emoji según el nivel de ocupación.
   */
  static getOccupancyText(level: OccupancyLevel): string {
    const texts: Record<OccupancyLevel, string> = {
      [OccupancyLevel.LOW]:    '🟢 Disponible',
      [OccupancyLevel.MEDIUM]: '🟡 Moderado',
      [OccupancyLevel.HIGH]:   '🔴 Muy ocupado',
      [OccupancyLevel.FULL]:   '⛔ Lleno',
    };
    return texts[level];
  }

  /**
   * Color hex para el frontend según el nivel de ocupación.
   */
  static getOccupancyColor(level: OccupancyLevel): string {
    const colors: Record<OccupancyLevel, string> = {
      [OccupancyLevel.LOW]:    '#22c55e', // verde
      [OccupancyLevel.MEDIUM]: '#f59e0b', // amarillo
      [OccupancyLevel.HIGH]:   '#ef4444', // rojo
      [OccupancyLevel.FULL]:   '#7f1d1d', // rojo oscuro
    };
    return colors[level];
  }

  /**
   * Calcula el multiplicador de ocupación según la hora y el día.
   *
   * @param hour      - Hora del día 0–23
   * @param dayOfWeek - Día de la semana 0=Dom … 6=Sáb
   * @returns Multiplicador (ej: 1.35 en hora punta)
   */
  static getPeakHourMultiplier(hour: number, dayOfWeek: number): number {
    // Multiplicador base por día
    const dayMultiplier = DAY_MULTIPLIERS[dayOfWeek] ?? 1.0;

    // Multiplicador por hora punta
    const peakSlot = PEAK_HOURS.find(
      (slot) => hour >= slot.start && hour < slot.end,
    );
    const hourMultiplier = peakSlot ? peakSlot.multiplier : 1.0;

    return dayMultiplier * hourMultiplier;
  }

  /**
   * Predice el nivel de ocupación de un bus para el próximo tramo.
   *
   * ⚠️ PUNTO DE MIGRACIÓN AL CLÚSTER ML:
   * Reemplazar el cuerpo de este método con la llamada al modelo real.
   * Ejemplo:
   *   const response = await fetch(process.env.ML_CLUSTER_URL, { body: JSON.stringify(input) });
   *   return await response.json() as PredictionResult;
   *
   * @param input - Datos del bus y contexto temporal
   * @returns PredictionResult con la predicción y metadatos
   */
  static predict(input: PredictionInput): PredictionResult {
    const { currentPassengers, capacity } = input;

    // Usar hora y día actuales si no se proveen
    const now = new Date();
    const hour      = input.hour      ?? now.getHours();
    const dayOfWeek = input.dayOfWeek ?? now.getDay();

    // Ratio actual de ocupación
    const currentRatio = currentPassengers / capacity;

    // Multiplicador por hora punta y día
    const peakMultiplier = OccupancyPredictionService.getPeakHourMultiplier(
      hour, dayOfWeek,
    );

    // Variación aleatoria para simular incertidumbre (±NOISE_FACTOR)
    const noise = 1 + (Math.random() * 2 - 1) * NOISE_FACTOR;

    // Ratio predicho, limitado al rango [0, 1]
    const predictedRatio = Math.min(1, Math.max(0, currentRatio * peakMultiplier * noise));

    const predictedPassengers = Math.round(predictedRatio * capacity);
    const level               = OccupancyPredictionService.getOccupancyLevel(predictedRatio);

    return {
      predictedOccupancyRatio: Math.round(predictedRatio * 1000) / 1000,
      predictedPassengers,
      occupancyLevel:  level,
      occupancyText:   OccupancyPredictionService.getOccupancyText(level),
      occupancyColor:  OccupancyPredictionService.getOccupancyColor(level),
      confidence:      SIMULATED_CONFIDENCE,
      isSimulated:     true,
      predictedAt:     now.toISOString(),
    };
  }
}
