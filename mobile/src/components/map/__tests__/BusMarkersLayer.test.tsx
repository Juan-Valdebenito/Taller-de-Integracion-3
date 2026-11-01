import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { animationDuration, interpolateHeading, useAnimatedPosition, type AnimatedPosition } from '../../../hooks/useAnimatedPosition';
import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import { busColor, busIconSize, busIconSvg } from '../busIcon';
import { BusIcon, BusMarkersLayer, busAccessibilityLabel } from '../BusMarkersLayer';

const buses = initialSimulatedBuses(Date.now());

describe('animación de las micros (igual al web)', () => {
  it('gira por el camino más corto', () => {
    expect(interpolateHeading(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(interpolateHeading(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(interpolateHeading(90, 180, 0.5)).toBeCloseTo(135, 6);
    expect(interpolateHeading(0, 270, 1)).toBeCloseTo(270, 6);
  });

  it('la duración sigue el ritmo de los mensajes: ×1.08, entre 700 ms y 2300 ms', () => {
    // Sin intervalo previo el web usa la duración base: 1800 × 1.08.
    expect(animationDuration(null)).toBeCloseTo(1944, 6);
    expect(animationDuration(2000)).toBeCloseTo(2160, 6);
    expect(animationDuration(200)).toBe(700);
    expect(animationDuration(10000)).toBe(2300);
  });

  it('se desliza hacia la nueva posición y llega al final de la animación', async () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    // Ejecuta el último cuadro pedido (los anteriores son de animaciones ya reemplazadas).
    const runFrame = async (t: number) => {
      now = t;
      const cb = frames.pop();
      frames.length = 0;
      await act(async () => cb?.(t));
    };

    const { result, rerender } = await renderHook<AnimatedPosition, { lat: number }>(({ lat }) => useAnimatedPosition(lat, -72.59, 0), {
      initialProps: { lat: -38.73 },
    });
    await runFrame(0);
    now = 1000;
    await rerender({ lat: -38.74 });
    // A mitad de camino (dura 1000 × 1.08 ms: el intervalo desde la posición anterior).
    await runFrame(now + 540);
    expect(result.current.latitude).toBeGreaterThan(-38.74);
    expect(result.current.latitude).toBeLessThan(-38.73);
    await runFrame(now + 5000);
    expect(result.current.latitude).toBeCloseTo(-38.74, 6);
    jest.restoreAllMocks();
  });
});

describe('ícono de micro', () => {
  it('el color es el que manda el backend o, si no, el de la ocupación', () => {
    expect(busColor({ ...buses[0], currentPassengers: 10, capacity: 40 })).toBe('#22c55e');
    expect(busColor({ ...buses[0], currentPassengers: 38, capacity: 40 })).toBe('#ef4444');
    expect(busColor({ ...buses[0], occupancy: { occupancyColor: '#123456' } as never })).toBe('#123456');
  });

  it('mide 36 px, 46 si está seleccionada, como el web', () => {
    expect([busIconSize(false), busIconSize(true)]).toEqual([36, 46]);
  });

  it('el SVG (versión web) es el del web: halo, cuerpo, flecha girada y 🚌', () => {
    const svg = busIconSvg('#22c55e', 90, false, false);
    expect(svg).toContain('width="36"');
    expect(svg).toContain('fill="#22c55e" opacity="0.18"');
    expect(svg).toContain('rotate(90, 18, 18)');
    expect(svg).toContain('🚌');
    expect(svg).not.toContain('<animate');
    expect(busIconSvg('#22c55e', 0, true, true).match(/<animate /g)).toHaveLength(3);
  });

  it('la versión de teléfono gira la flecha según el rumbo', async () => {
    await render(<BusIcon color="#f97316" heading={135} selected={false} recent={false} />);

    const icon = screen.getByTestId('bus-icon');
    expect(StyleSheet.flatten(icon.props.style)).toMatchObject({ width: 36, height: 36 });
    const rotated = icon.props.children.filter(Boolean).find((c: { props: { style: object } }) => {
      const style = StyleSheet.flatten(c.props.style) as { transform?: unknown };
      return style.transform;
    });
    expect(StyleSheet.flatten(rotated.props.style).transform).toEqual([{ rotate: '135deg' }]);
  });
});

describe('BusMarkersLayer', () => {
  it('dibuja una micro por cada una, accesible con su línea y ocupación', async () => {
    await render(<BusMarkersLayer buses={buses} />);

    expect(screen.getAllByTestId('map-Marker')).toHaveLength(3);
    expect(screen.getByLabelText('Micro Línea 7A, 40 % de ocupación')).toBeTruthy();
    expect(busAccessibilityLabel(buses[2])).toBe('Micro Línea 1C, 55 % de ocupación');
  });

  it('al tocar una micro avisa cuál es', async () => {
    const onSelect = jest.fn();
    await render(<BusMarkersLayer buses={buses} onSelect={onSelect} />);

    await fireEvent.press(screen.getByLabelText('Micro Línea 7B, 60 % de ocupación'));

    expect(onSelect).toHaveBeenCalledWith('sim-route-7B-1');
  });

  it('la micro seleccionada se ve más grande y encima de las demás', async () => {
    await render(<BusMarkersLayer buses={buses} selectedId="sim-route-1C-1" />);

    const markers = screen.getAllByTestId('map-Marker');
    expect(markers[2].props.zIndex).toBe(2);
    expect(StyleSheet.flatten(screen.getAllByTestId('bus-icon')[2].props.style)).toMatchObject({ width: 46 });
    expect(StyleSheet.flatten(screen.getAllByTestId('bus-icon')[0].props.style)).toMatchObject({ width: 36 });
  });
});
