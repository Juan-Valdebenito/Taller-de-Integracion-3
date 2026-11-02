import { act, renderHook } from '@testing-library/react-native';

import type { RouteStop } from '../../api/companyApi';
import { useElapsedMinutes, useTripProgress } from '../../hooks/useTripProgress';
import { advanceReached, ARRIVAL_RADIUS_M, elapsedMinutes, tripProgress } from '../tripProgress';

// 4 paraderos en línea recta hacia el norte, separados ~1 km.
const north = (meters: number) => -38.75 + meters / 111_195;
const stops: RouteStop[] = [0, 1000, 2000, 3000].map((m, i) => ({
  id: `s${i}`,
  name: `Paradero ${i + 1}`,
  latitude: north(m),
  longitude: -72.6,
  order: i + 1,
}));
const at = (meters: number) => ({ latitude: north(meters), longitude: -72.6 });

describe('avance del recorrido', () => {
  it('un paradero queda pasado al llegar a menos de 60 m', () => {
    expect(ARRIVAL_RADIUS_M).toBe(60);
    expect(advanceReached(-1, stops, at(-200))).toBe(-1); // todavía antes del primero
    expect(advanceReached(-1, stops, at(40))).toBe(0);
    expect(advanceReached(0, stops, at(1500))).toBe(0); // entre paraderos: sigue en el último alcanzado
    expect(advanceReached(0, stops, at(1030))).toBe(1);
  });

  it('nunca retrocede, y si se salta un paradero avanza igual', () => {
    expect(advanceReached(2, stops, at(10))).toBe(2); // GPS cerca del primero: no vuelve atrás
    expect(advanceReached(0, stops, at(2000))).toBe(2); // no pasó cerca del 2.º, pero llegó al 3.º
    expect(advanceReached(1, stops, null)).toBe(1); // sin posición no cambia
  });

  it('el porcentaje es la parte de paraderos pasados, y la próxima es la siguiente', () => {
    expect(tripProgress(-1, 4)).toMatchObject({ percent: 0, nextIndex: 0 });
    expect(tripProgress(1, 4)).toMatchObject({ percent: 50, nextIndex: 2 });
    const end = tripProgress(3, 4);
    expect(end).toMatchObject({ percent: 100, nextIndex: null });
    expect([0, 1, 2].map(tripProgress(1, 4).isPassed)).toEqual([true, true, false]);
    expect(tripProgress(-1, 0)).toMatchObject({ percent: 0, nextIndex: null });
  });

  it('cuenta los minutos enteros desde el inicio', () => {
    expect(elapsedMinutes(0, 59_999)).toBe(0);
    expect(elapsedMinutes(0, 12 * 60_000 + 5_000)).toBe(12);
    expect(elapsedMinutes(10_000, 0)).toBe(0);
  });
});

describe('useTripProgress', () => {
  it('avanza con cada posición y vuelve a cero al cambiar de ruta', async () => {
    const { result, rerender } = await renderHook(
      ({ routeId, position }: { routeId: string; position: ReturnType<typeof at> | null }) => useTripProgress(routeId, stops, position),
      { initialProps: { routeId: 'r1', position: null as ReturnType<typeof at> | null } },
    );
    expect(result.current).toMatchObject({ percent: 0, nextIndex: 0, reached: -1 });

    await rerender({ routeId: 'r1', position: at(1010) });
    expect(result.current).toMatchObject({ percent: 50, nextIndex: 2, reached: 1 });
    await rerender({ routeId: 'r1', position: at(500) }); // entre paraderos: se mantiene
    expect(result.current.reached).toBe(1);

    await rerender({ routeId: 'r2', position: null });
    expect(result.current).toMatchObject({ percent: 0, reached: -1 });
  });

  it('useElapsedMinutes se actualiza solo', async () => {
    jest.useFakeTimers({ now: 0 });
    try {
      const { result } = await renderHook(() => useElapsedMinutes(0));
      expect(result.current).toBe(0);
      await act(async () => jest.advanceTimersByTime(2 * 60_000));
      expect(result.current).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
