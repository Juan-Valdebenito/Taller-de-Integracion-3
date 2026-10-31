import { BRAND_GRADIENT, BUS_STATUS, OCCUPANCY_COLORS, occupancyColor, occupancyLevel } from '../status';

// Mismos cortes y colores que el frontend web (hooks/useSimulatedBuses.ts).
describe('occupancyLevel', () => {
  it.each([
    [0, 40, 'low'],
    [19, 40, 'low'],
    [20, 40, 'medium'], // 50 %
    [29, 40, 'medium'],
    [30, 40, 'high'], // 75 %
    [35, 40, 'high'],
    [36, 40, 'full'], // 90 %
    [45, 40, 'full'],
  ] as const)('%i de %i pasajeros → %s', (current, capacity, level) => {
    expect(occupancyLevel(current, capacity)).toBe(level);
  });

  it('sin capacidad conocida se considera llena', () => {
    expect(occupancyLevel(3, 0)).toBe('full');
  });
});

describe('colores', () => {
  it('ocupación: verde, amarillo, naranja y rojo como el web', () => {
    expect(OCCUPANCY_COLORS).toEqual({ low: '#22c55e', medium: '#f59e0b', high: '#f97316', full: '#ef4444' });
    expect(occupancyColor(10, 40)).toBe('#22c55e');
    expect(occupancyColor(38, 40)).toBe('#ef4444');
  });

  it('estados de las micros con las etiquetas del web', () => {
    expect(BUS_STATUS).toEqual({
      ACTIVE: { label: 'En ruta', color: '#22c55e' },
      STOPPED: { label: 'Detenido', color: '#f59e0b' },
      DELAYED: { label: 'Retrasado', color: '#ef4444' },
    });
  });

  it('degradado de la marca: --color-primary-400 → --color-primary-200', () => {
    expect(BRAND_GRADIENT).toEqual(['#2b7cee', '#88b8fc']);
  });
});
