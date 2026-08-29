import { ETAService, DEFAULT_BUS_SPEED_KMH } from '../ETAService';
import { GeoLocation } from '../../entities/Bus';
import { Stop } from '../../entities/Route';

/**
 * Suite de pruebas unitarias para ETAService.
 *
 * Cubre:
 *  1. Cálculo de distancia (Haversine)
 *  2. Formateo de ETA
 *  3. Cálculo de ETA con velocidad explícita
 *  4. Cálculo de ETA con velocidad por defecto
 *  5. Bus parado (speed = 0)
 *  6. Bus en la misma parada (distancia = 0)
 *  7. Wrapper getETAToStop con entidades reales
 */

// ─── Coordenadas de referencia (Temuco, Chile) ──────────────────────────────
// Plaza de Armas de Temuco
const TEMUCO_PLAZA = { latitude: -38.7359, longitude: -72.5904 };
// Terminal de Buses Rodoviario (~1.45 km desde la Plaza)
const TEMUCO_TERMINAL = { latitude: -38.7479, longitude: -72.5971 };
// Aeropuerto Maquehue (~12 km desde la Plaza)
const TEMUCO_AEROPUERTO = { latitude: -38.8400, longitude: -72.6300 };

// ────────────────────────────────────────────────────────────────────────────


describe('ETAService', () => {

  // ── 1. calculateDistance ────────────────────────────────────────────────
  describe('calculateDistance()', () => {

    it('debería retornar 0 cuando origen y destino son el mismo punto', () => {
      const distance = ETAService.calculateDistance(TEMUCO_PLAZA, TEMUCO_PLAZA);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('debería calcular correctamente la distancia Plaza → Terminal de Temuco (~1.45 km)', () => {
      const distance = ETAService.calculateDistance(TEMUCO_PLAZA, TEMUCO_TERMINAL);
      // Distancia real aproximada entre Plaza de Armas y Terminal Rodoviario: 1.45 km
      expect(distance).toBeGreaterThan(1.0);
      expect(distance).toBeLessThan(1.8);
    });

    it('debería calcular correctamente Plaza → Aeropuerto Maquehue (~12 km en línea recta)', () => {
      const distance = ETAService.calculateDistance(TEMUCO_PLAZA, TEMUCO_AEROPUERTO);
      expect(distance).toBeGreaterThan(10);
      expect(distance).toBeLessThan(14);
    });

    it('debería ser simétrica (A→B == B→A)', () => {
      const d1 = ETAService.calculateDistance(TEMUCO_PLAZA, TEMUCO_TERMINAL);
      const d2 = ETAService.calculateDistance(TEMUCO_TERMINAL, TEMUCO_PLAZA);
      expect(d1).toBeCloseTo(d2, 10);
    });

  });

  // ── 2. formatETA ────────────────────────────────────────────────────────
  describe('formatETA()', () => {

    it('debería retornar "Bus parado" cuando ETA es Infinity', () => {
      expect(ETAService.formatETA(Infinity)).toBe('Bus parado');
    });

    it('debería retornar "Llegando ahora" cuando ETA < 1 minuto', () => {
      expect(ETAService.formatETA(0)).toBe('Llegando ahora');
      expect(ETAService.formatETA(0.5)).toBe('Llegando ahora');
    });

    it('debería retornar minutos cuando ETA < 60 min', () => {
      expect(ETAService.formatETA(2)).toBe('2 min');
      expect(ETAService.formatETA(15)).toBe('15 min');
      expect(ETAService.formatETA(59)).toBe('59 min');
    });

    it('debería retornar horas exactas cuando no hay minutos restantes', () => {
      expect(ETAService.formatETA(60)).toBe('1 h');
      expect(ETAService.formatETA(120)).toBe('2 h');
    });

    it('debería retornar "X h Y min" cuando hay horas y minutos', () => {
      expect(ETAService.formatETA(65)).toBe('1 h 5 min');
      expect(ETAService.formatETA(90)).toBe('1 h 30 min');
      expect(ETAService.formatETA(125)).toBe('2 h 5 min');
    });

  });

  // ── 3. calculateETA con velocidad explícita ──────────────────────────────
  describe('calculateETA() con velocidad explícita', () => {

    it('debería retornar ~2 min para 1 km a 30 km/h', () => {
      // 1 km / 30 km/h * 60 = 2 min
      // Usamos coordenadas que den ~1 km (ajuste fino no necesario, probamos la fórmula)
      const from = { latitude: 0, longitude: 0 };
      const to   = { latitude: 0, longitude: 0.009 }; // ~1 km en el ecuador
      const result = ETAService.calculateETA(from, to, 30);

      expect(result.etaMinutes).toBeCloseTo(2, 0);
      expect(result.speedKmh).toBe(30);
      expect(result.distanceKm).toBeGreaterThan(0);
    });

    it('debería retornar ~5 min para ~5 km a 60 km/h', () => {
      const from = { latitude: 0, longitude: 0 };
      const to   = { latitude: 0, longitude: 0.045 }; // ~5 km en el ecuador
      const result = ETAService.calculateETA(from, to, 60);

      expect(result.etaMinutes).toBeCloseTo(5, 0);
      expect(result.speedKmh).toBe(60);
    });

    it('debería calcular ETA correctamente Plaza de Armas → Terminal Rodoviario de Temuco a 40 km/h', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL, 40);

      // ~1.45 km / 40 km/h * 60 ≈ 2.2 min
      expect(result.etaMinutes).toBeGreaterThan(1);
      expect(result.etaMinutes).toBeLessThan(4);
      expect(result.etaText).toMatch(/min/);
    });

    it('debería tener distanceKm redondeado a 3 decimales', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL, 30);
      const decimals = result.distanceKm.toString().split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(3);
    });

  });

  // ── 4. calculateETA sin velocidad (usa DEFAULT) ───────────────────────────
  describe('calculateETA() sin velocidad (velocidad por defecto)', () => {

    it(`debería usar ${DEFAULT_BUS_SPEED_KMH} km/h como velocidad por defecto`, () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL);
      expect(result.speedKmh).toBe(DEFAULT_BUS_SPEED_KMH);
    });

    it('debería retornar etaMinutes finito cuando no se provee velocidad', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL);
      expect(isFinite(result.etaMinutes)).toBe(true);
    });

    it('debería retornar etaText legible cuando no se provee velocidad', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL);
      expect(result.etaText).not.toBe('Bus parado');
      expect(result.etaText).not.toBe('');
    });

  });

  // ── 5. Bus parado (speed = 0) ────────────────────────────────────────────
  describe('calculateETA() con bus parado (speed = 0)', () => {

    it('debería retornar etaMinutes = Infinity cuando speed = 0', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL, 0);
      expect(result.etaMinutes).toBe(Infinity);
    });

    it('debería retornar etaText = "Bus parado" cuando speed = 0', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL, 0);
      expect(result.etaText).toBe('Bus parado');
    });

    it('debería mantener la distancia calculada aunque el bus esté parado', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_TERMINAL, 0);
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.speedKmh).toBe(0);
    });

  });

  // ── 6. Bus en la misma parada (distancia = 0) ────────────────────────────
  describe('calculateETA() con bus en la misma ubicación que la parada', () => {

    it('debería retornar distanceKm ≈ 0', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_PLAZA, 30);
      expect(result.distanceKm).toBeCloseTo(0, 3);
    });

    it('debería retornar etaMinutes ≈ 0', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_PLAZA, 30);
      expect(result.etaMinutes).toBeCloseTo(0, 3);
    });

    it('debería retornar etaText = "Llegando ahora"', () => {
      const result = ETAService.calculateETA(TEMUCO_PLAZA, TEMUCO_PLAZA, 30);
      expect(result.etaText).toBe('Llegando ahora');
    });

  });

  // ── 7. getETAToStop con entidades reales ─────────────────────────────────
  describe('getETAToStop() usando entidades Bus y Route', () => {

    const busLocation: GeoLocation = {
      latitude: TEMUCO_PLAZA.latitude,
      longitude: TEMUCO_PLAZA.longitude,
      heading: 90,
      speed: 40,         // 40 km/h
      timestamp: new Date(),
    };

    const stop: Stop = {
      id: 'stop-001',
      name: 'Terminal de Buses Rodoviario Temuco',
      latitude: TEMUCO_TERMINAL.latitude,
      longitude: TEMUCO_TERMINAL.longitude,
      order: 5,
    };

    it('debería retornar un ETAResult válido', () => {
      const result = ETAService.getETAToStop(busLocation, stop);
      expect(result).toBeDefined();
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.etaText).toBeTruthy();
    });

    it('debería usar la velocidad del bus reportada (40 km/h)', () => {
      const result = ETAService.getETAToStop(busLocation, stop);
      expect(result.speedKmh).toBe(40);
    });

    it('debería usar DEFAULT_BUS_SPEED_KMH si el bus no reporta velocidad', () => {
      const busWithoutSpeed: GeoLocation = {
        ...busLocation,
        speed: undefined,
      };
      const result = ETAService.getETAToStop(busWithoutSpeed, stop);
      expect(result.speedKmh).toBe(DEFAULT_BUS_SPEED_KMH);
    });

    it('debería calcular ETA Plaza de Armas→Terminal Rodoviario Temuco entre 1 y 5 min a 40 km/h', () => {
      const result = ETAService.getETAToStop(busLocation, stop);
      expect(result.etaMinutes).toBeGreaterThan(1);
      expect(result.etaMinutes).toBeLessThan(5);
    });

  });

});
