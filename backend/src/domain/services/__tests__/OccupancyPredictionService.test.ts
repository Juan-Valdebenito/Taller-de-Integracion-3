import {
  OccupancyPredictionService,
  PredictionInput,
} from '../OccupancyPredictionService';
import { OccupancyLevel } from '../../../shared/enums';

/**
 * Suite de pruebas unitarias para OccupancyPredictionService.
 *
 * Cubre:
 *  1. getOccupancyLevel()       → 4 niveles + bordes
 *  2. getOccupancyText()        → texto con emoji por nivel
 *  3. getOccupancyColor()       → color hex por nivel
 *  4. getPeakHourMultiplier()   → hora punta, hora normal, fin de semana
 *  5. predict()                 → forma del resultado, rangos válidos, flags
 *  6. predict() con hora punta  → predicción > ratio base
 *  7. predict() fin de semana   → predicción < hora punta laboral
 *  8. predict() bus lleno       → cap en 1.0 (no supera 100%)
 *  9. predict() bus vacío       → predicción cercana a 0
 */

// ─── Helpers de entrada ───────────────────────────────────────────────────────

/** Bus con 18/45 pasajeros = 40% → límite LOW/MEDIUM */
const busAtLimit = (passengers: number, capacity = 45): PredictionInput => ({
  currentPassengers: passengers,
  capacity,
});

/** Bus en hora punta matinal de un lunes */
const busPeakMorning = (passengers: number, capacity = 45): PredictionInput => ({
  currentPassengers: passengers,
  capacity,
  hour: 8,
  dayOfWeek: 1, // lunes
});

/** Bus en domingo a las 15h (baja demanda) */
const busSundayAfternoon = (passengers: number, capacity = 45): PredictionInput => ({
  currentPassengers: passengers,
  capacity,
  hour: 15,
  dayOfWeek: 0, // domingo
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OccupancyPredictionService', () => {

  // ── 1. getOccupancyLevel ──────────────────────────────────────────────────
  describe('getOccupancyLevel()', () => {

    it('debería retornar LOW cuando ratio < 0.4', () => {
      expect(OccupancyPredictionService.getOccupancyLevel(0)).toBe(OccupancyLevel.LOW);
      expect(OccupancyPredictionService.getOccupancyLevel(0.2)).toBe(OccupancyLevel.LOW);
      expect(OccupancyPredictionService.getOccupancyLevel(0.39)).toBe(OccupancyLevel.LOW);
    });

    it('debería retornar MEDIUM cuando ratio entre 0.4 y 0.7', () => {
      expect(OccupancyPredictionService.getOccupancyLevel(0.4)).toBe(OccupancyLevel.MEDIUM);
      expect(OccupancyPredictionService.getOccupancyLevel(0.55)).toBe(OccupancyLevel.MEDIUM);
      expect(OccupancyPredictionService.getOccupancyLevel(0.69)).toBe(OccupancyLevel.MEDIUM);
    });

    it('debería retornar HIGH cuando ratio entre 0.7 y 0.9', () => {
      expect(OccupancyPredictionService.getOccupancyLevel(0.7)).toBe(OccupancyLevel.HIGH);
      expect(OccupancyPredictionService.getOccupancyLevel(0.80)).toBe(OccupancyLevel.HIGH);
      expect(OccupancyPredictionService.getOccupancyLevel(0.89)).toBe(OccupancyLevel.HIGH);
    });

    it('debería retornar FULL cuando ratio >= 0.9', () => {
      expect(OccupancyPredictionService.getOccupancyLevel(0.9)).toBe(OccupancyLevel.FULL);
      expect(OccupancyPredictionService.getOccupancyLevel(0.95)).toBe(OccupancyLevel.FULL);
      expect(OccupancyPredictionService.getOccupancyLevel(1.0)).toBe(OccupancyLevel.FULL);
    });

  });

  // ── 2. getOccupancyText ───────────────────────────────────────────────────
  describe('getOccupancyText()', () => {

    it('debería retornar "🟢 Disponible" para LOW', () => {
      expect(OccupancyPredictionService.getOccupancyText(OccupancyLevel.LOW))
        .toBe('🟢 Disponible');
    });

    it('debería retornar "🟡 Moderado" para MEDIUM', () => {
      expect(OccupancyPredictionService.getOccupancyText(OccupancyLevel.MEDIUM))
        .toBe('🟡 Moderado');
    });

    it('debería retornar "🔴 Muy ocupado" para HIGH', () => {
      expect(OccupancyPredictionService.getOccupancyText(OccupancyLevel.HIGH))
        .toBe('🔴 Muy ocupado');
    });

    it('debería retornar "⛔ Lleno" para FULL', () => {
      expect(OccupancyPredictionService.getOccupancyText(OccupancyLevel.FULL))
        .toBe('⛔ Lleno');
    });

  });

  // ── 3. getOccupancyColor ──────────────────────────────────────────────────
  describe('getOccupancyColor()', () => {

    it('debería retornar verde (#22c55e) para LOW', () => {
      expect(OccupancyPredictionService.getOccupancyColor(OccupancyLevel.LOW))
        .toBe('#22c55e');
    });

    it('debería retornar amarillo (#f59e0b) para MEDIUM', () => {
      expect(OccupancyPredictionService.getOccupancyColor(OccupancyLevel.MEDIUM))
        .toBe('#f59e0b');
    });

    it('debería retornar rojo (#ef4444) para HIGH', () => {
      expect(OccupancyPredictionService.getOccupancyColor(OccupancyLevel.HIGH))
        .toBe('#ef4444');
    });

    it('debería retornar rojo oscuro (#7f1d1d) para FULL', () => {
      expect(OccupancyPredictionService.getOccupancyColor(OccupancyLevel.FULL))
        .toBe('#7f1d1d');
    });

  });

  // ── 4. getPeakHourMultiplier ──────────────────────────────────────────────
  describe('getPeakHourMultiplier()', () => {

    it('debería retornar multiplicador > 1 en hora punta matinal (8h lunes)', () => {
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(8, 1);
      expect(multiplier).toBeGreaterThan(1.0);
    });

    it('debería retornar multiplicador > 1 en hora punta vespertina (17h lunes)', () => {
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(17, 1);
      expect(multiplier).toBeGreaterThan(1.0);
    });

    it('debería retornar multiplicador == 1.0 en hora normal de lunes (10h)', () => {
      // 10h no está en hora punta, lunes tiene multiplicador 1.0
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(10, 1);
      expect(multiplier).toBeCloseTo(1.0);
    });

    it('debería retornar multiplicador < 1 en domingo (baja demanda)', () => {
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(10, 0);
      expect(multiplier).toBeLessThan(1.0);
    });

    it('debería retornar multiplicador < 1 en sábado', () => {
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(10, 6);
      expect(multiplier).toBeLessThan(1.0);
    });

    it('hora punta de domingo debería ser menor que hora punta de lunes', () => {
      const mondayPeak  = OccupancyPredictionService.getPeakHourMultiplier(8, 1);
      const sundayPeak  = OccupancyPredictionService.getPeakHourMultiplier(8, 0);
      expect(sundayPeak).toBeLessThan(mondayPeak);
    });

    it('debería usar multiplicador 1.0 si dayOfWeek es un valor fuera de rango', () => {
      // dayOfWeek = 7 no existe en DAY_MULTIPLIERS → usa el fallback ?? 1.0
      const multiplier = OccupancyPredictionService.getPeakHourMultiplier(10, 7);
      expect(multiplier).toBeCloseTo(1.0);
    });

  });

  // ── 5. predict() — forma y validez del resultado ──────────────────────────
  describe('predict() — estructura del resultado', () => {

    const input: PredictionInput = busPeakMorning(20);
    let result: ReturnType<typeof OccupancyPredictionService.predict>;

    beforeEach(() => {
      result = OccupancyPredictionService.predict(input);
    });

    it('debería retornar un objeto con todos los campos requeridos', () => {
      expect(result).toHaveProperty('predictedOccupancyRatio');
      expect(result).toHaveProperty('predictedPassengers');
      expect(result).toHaveProperty('occupancyLevel');
      expect(result).toHaveProperty('occupancyText');
      expect(result).toHaveProperty('occupancyColor');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('isSimulated');
      expect(result).toHaveProperty('predictedAt');
    });

    it('isSimulated siempre debería ser true', () => {
      expect(result.isSimulated).toBe(true);
    });

    it('confidence debería ser un número entre 0 y 1', () => {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('predictedOccupancyRatio debería estar entre 0 y 1', () => {
      expect(result.predictedOccupancyRatio).toBeGreaterThanOrEqual(0);
      expect(result.predictedOccupancyRatio).toBeLessThanOrEqual(1);
    });

    it('predictedPassengers debería ser un entero no negativo', () => {
      expect(result.predictedPassengers).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.predictedPassengers)).toBe(true);
    });

    it('predictedAt debería ser una fecha ISO válida', () => {
      const parsed = new Date(result.predictedAt);
      expect(parsed.toISOString()).toBe(result.predictedAt);
    });

    it('occupancyText debería ser un string no vacío', () => {
      expect(result.occupancyText).toBeTruthy();
      expect(typeof result.occupancyText).toBe('string');
    });

    it('occupancyColor debería ser un hex válido (#xxxxxx)', () => {
      expect(result.occupancyColor).toMatch(/^#[0-9a-f]{6}$/i);
    });

  });

  // ── 6. predict() con bus vacío → predicción cercana a 0 ──────────────────
  describe('predict() con bus vacío', () => {

    it('debería predecir ocupación muy baja para bus vacío en hora normal', () => {
      const result = OccupancyPredictionService.predict({
        currentPassengers: 0,
        capacity: 45,
        hour: 10,
        dayOfWeek: 1,
      });
      expect(result.predictedOccupancyRatio).toBeCloseTo(0, 3);
      expect(result.occupancyLevel).toBe(OccupancyLevel.LOW);
    });

  });

  // ── 7. predict() bus lleno → no supera 100% ───────────────────────────────
  describe('predict() con bus lleno (cap en 1.0)', () => {

    it('predictedOccupancyRatio no debería superar 1.0 aunque el multiplicador sea alto', () => {
      // Bus al 100% + hora punta → sigue siendo máximo 1.0
      const result = OccupancyPredictionService.predict({
        currentPassengers: 45,
        capacity: 45,
        hour: 17,       // hora punta vespertina
        dayOfWeek: 1,   // lunes
      });
      expect(result.predictedOccupancyRatio).toBeLessThanOrEqual(1.0);
      expect(result.predictedPassengers).toBeLessThanOrEqual(45);
    });

    it('debería retornar nivel FULL para bus lleno en hora punta', () => {
      const result = OccupancyPredictionService.predict({
        currentPassengers: 45,
        capacity: 45,
        hour: 17,
        dayOfWeek: 1,
      });
      expect(result.occupancyLevel).toBe(OccupancyLevel.FULL);
    });

  });

  // ── 8. predict() hora punta vs hora normal ────────────────────────────────
  describe('predict() hora punta vs hora normal', () => {

    it('la predicción en hora punta debería ser mayor o igual que en hora normal (mismo bus)', () => {
      // Ejecutamos múltiples veces para reducir el efecto del ruido aleatorio
      const peakRatios:   number[] = [];
      const normalRatios: number[] = [];

      for (let i = 0; i < 20; i++) {
        peakRatios.push(OccupancyPredictionService.predict({
          currentPassengers: 20, capacity: 45, hour: 8, dayOfWeek: 1,
        }).predictedOccupancyRatio);

        normalRatios.push(OccupancyPredictionService.predict({
          currentPassengers: 20, capacity: 45, hour: 10, dayOfWeek: 1,
        }).predictedOccupancyRatio);
      }

      const avgPeak   = peakRatios.reduce((a, b) => a + b) / peakRatios.length;
      const avgNormal = normalRatios.reduce((a, b) => a + b) / normalRatios.length;

      // En promedio, la hora punta debe generar mayor predicción
      expect(avgPeak).toBeGreaterThan(avgNormal);
    });

  });

  // ── 9. predict() día laboral vs fin de semana ─────────────────────────────
  describe('predict() día laboral vs fin de semana', () => {

    it('la predicción en lunes debería ser mayor que en domingo (mismo bus y hora)', () => {
      const mondayRatios:  number[] = [];
      const sundayRatios:  number[] = [];

      for (let i = 0; i < 20; i++) {
        mondayRatios.push(OccupancyPredictionService.predict({
          currentPassengers: 20, capacity: 45, hour: 10, dayOfWeek: 1,
        }).predictedOccupancyRatio);

        sundayRatios.push(OccupancyPredictionService.predict({
          currentPassengers: 20, capacity: 45, hour: 10, dayOfWeek: 0,
        }).predictedOccupancyRatio);
      }

      const avgMonday = mondayRatios.reduce((a, b) => a + b) / mondayRatios.length;
      const avgSunday = sundayRatios.reduce((a, b) => a + b) / sundayRatios.length;

      expect(avgMonday).toBeGreaterThan(avgSunday);
    });

  });

  // ── 10. predict() usa hora y día del sistema si no se proveen ─────────────
  describe('predict() defaults de hora y día', () => {

    it('debería funcionar sin pasar hour ni dayOfWeek', () => {
      const result = OccupancyPredictionService.predict({
        currentPassengers: 20,
        capacity: 45,
      });
      expect(result).toBeDefined();
      expect(result.predictedOccupancyRatio).toBeGreaterThanOrEqual(0);
    });

  });

});
