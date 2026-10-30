import { fireEvent, render, screen } from '@testing-library/react-native';

import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import { countForRoute, filterBusesByRoute, ROUTE_OPTIONS, RouteFilter } from '../RouteFilter';

const buses = [...initialSimulatedBuses(0), { ...initialSimulatedBuses(0)[0], id: 'otra-7A' }]; // 2 de la 7A, 1 de la 7B, 1 de la 1C

describe('RouteFilter', () => {
  it('tiene las opciones del web, en su orden', () => {
    expect(ROUTE_OPTIONS.map((option) => option.label)).toEqual(['Todas las rutas', 'Línea 7A', 'Línea 7B', 'Línea 1C']);
  });

  it('cuenta y filtra las micros por línea', () => {
    expect(countForRoute(buses, 'all')).toBe(4);
    expect(countForRoute(buses, 'route-7A')).toBe(2);
    expect(countForRoute(buses, 'route-1C')).toBe(1);
    expect(filterBusesByRoute(buses, 'all')).toBe(buses);
    expect(filterBusesByRoute(buses, 'route-7A').map((bus) => bus.id)).toEqual([buses[0].id, 'otra-7A']);
  });

  it('muestra cada línea con su cantidad y marca la elegida', async () => {
    await render(<RouteFilter buses={buses} value="route-7B" onChange={jest.fn()} />);

    expect(screen.getByText('Ruta:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todas las rutas, 4 micros' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Línea 7A, 2 micros' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Línea 7B, 1 micros' })).toBeSelected();
  });

  it('al tocar una línea avisa cuál se eligió', async () => {
    const onChange = jest.fn();
    await render(<RouteFilter buses={buses} value="all" onChange={onChange} />);

    fireEvent.press(screen.getByRole('button', { name: /^Línea 1C/ }));
    expect(onChange).toHaveBeenCalledWith('route-1C');
  });
});
