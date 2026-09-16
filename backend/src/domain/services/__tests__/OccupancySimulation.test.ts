import {
  calculateOccupancy,
  processSimulationEvent,
  buses,
  MAX_BUS_CAPACITY,
  MIN_BUS_CAPACITY,
} from '../../../infrastructure/socket/simulation';

describe('Occupancy Simulation & Limits', () => {
  describe('calculateOccupancy', () => {
    it('debe calcular porcentaje correcto para valores intermedios', () => {
      const res = calculateOccupancy(14, 35);
      expect(res.clampedPassengers).toBe(14);
      expect(res.occupancyPercentage).toBe(40);
      expect(res.isFull).toBe(false);
    });

    it('debe marcar isFull en verdadero si llega a 35', () => {
      const res = calculateOccupancy(35, 35);
      expect(res.clampedPassengers).toBe(35);
      expect(res.occupancyPercentage).toBe(100);
      expect(res.isFull).toBe(true);
    });

    it('debe aplicar cota rígida máxima de 35 si se excede', () => {
      const res = calculateOccupancy(40, 35);
      expect(res.clampedPassengers).toBe(35);
      expect(res.occupancyPercentage).toBe(100);
      expect(res.isFull).toBe(true);
    });

    it('debe aplicar cota rígida mínima de 0 si es negativo', () => {
      const res = calculateOccupancy(-5, 35);
      expect(res.clampedPassengers).toBe(0);
      expect(res.occupancyPercentage).toBe(0);
      expect(res.isFull).toBe(false);
    });

    it('debe evitar división por cero si la capacidad es 0', () => {
      const res = calculateOccupancy(0, 0);
      expect(res.occupancyPercentage).toBe(0);
      expect(res.isFull).toBe(true);
    });
  });

  describe('processSimulationEvent', () => {
    const testBusId = 'B-7A-01';

    beforeEach(() => {
      processSimulationEvent(testBusId, 'reset_empty');
    });

    it('tap_in_normal incrementa pasajeros y abordajes', () => {
      const bus = processSimulationEvent(testBusId, 'tap_in_normal');
      expect(bus?.currentPassengers).toBe(1);
      expect(bus?.boardings).toBeGreaterThanOrEqual(1);
      expect(bus?.lastEvent?.type).toBe('CARD_TAP_NORMAL');
    });

    it('tap_in_student incrementa escolares', () => {
      const bus = processSimulationEvent(testBusId, 'tap_in_student');
      expect(bus?.currentPassengers).toBe(1);
      expect(bus?.schoolBoardings).toBeGreaterThanOrEqual(1);
      expect(bus?.lastEvent?.type).toBe('CARD_TAP_STUDENT');
    });

    it('sensor_alight decrementa pasajeros si > 0', () => {
      processSimulationEvent(testBusId, 'tap_in_normal');
      const bus = processSimulationEvent(testBusId, 'sensor_alight');
      expect(bus?.currentPassengers).toBe(0);
      expect(bus?.alightings).toBeGreaterThanOrEqual(1);
    });

    it('fill_max llena a 35 y marca isFull', () => {
      const bus = processSimulationEvent(testBusId, 'fill_max');
      expect(bus?.currentPassengers).toBe(35);
      expect(bus?.isFull).toBe(true);
      expect(bus?.occupancyPercentage).toBe(100);
    });

    it('reset_empty vacía a 0 y desmarca isFull', () => {
      processSimulationEvent(testBusId, 'fill_max');
      const bus = processSimulationEvent(testBusId, 'reset_empty');
      expect(bus?.currentPassengers).toBe(0);
      expect(bus?.isFull).toBe(false);
      expect(bus?.occupancyPercentage).toBe(0);
    });

    it('no permite superar 35 pasajeros al hacer tap_in_normal', () => {
      processSimulationEvent(testBusId, 'fill_max');
      const bus = processSimulationEvent(testBusId, 'tap_in_normal');
      expect(bus?.currentPassengers).toBe(35);
      expect(bus?.isFull).toBe(true);
      expect(bus?.lastEvent?.type).toBe('OVERCROWD_REJECTED');
    });
  });
});
