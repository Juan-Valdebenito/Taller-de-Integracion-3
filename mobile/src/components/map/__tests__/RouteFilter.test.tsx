import { fireEvent, render, screen } from '@testing-library/react-native';

import type { RealRoute } from '../../../realtime/realRoutes';
import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import { countForRoute, filterBusesByRoute, routeOptionsFor, RouteFilter } from '../RouteFilter';

const routes: RealRoute[] = [
  { id: 'route-centro', code: '1', name: 'Centro', label: 'Línea 1 — Centro', stops: [] },
  { id: 'route-norte', code: '2', name: 'Norte', label: 'Línea 2 — Norte', stops: [] },
];
const seeds = initialSimulatedBuses(0);
const buses = [
  { ...seeds[0], id: 'bus-1', routeId: 'route-centro', routeName: 'Línea 1 — Centro' },
  { ...seeds[1], id: 'bus-2', routeId: 'route-centro', routeName: 'Línea 1 — Centro' },
  { ...seeds[2], id: 'bus-3', routeId: 'route-norte', routeName: 'Línea 2 — Norte' },
];

describe('RouteFilter', () => {
  it('crea opciones a partir de rutas recibidas del backend', () => {
    expect(routeOptionsFor(routes)).toEqual([
      { id: 'all', label: 'Todas las rutas' },
      { id: 'route-centro', label: 'Línea 1 — Centro' },
      { id: 'route-norte', label: 'Línea 2 — Norte' },
    ]);
  });

  it('cuenta y filtra las micros por ID de ruta real', () => {
    expect(countForRoute(buses, 'all')).toBe(3);
    expect(countForRoute(buses, 'route-centro')).toBe(2);
    expect(filterBusesByRoute(buses, 'all')).toBe(buses);
    expect(filterBusesByRoute(buses, 'route-centro').map((bus) => bus.id)).toEqual(['bus-1', 'bus-2']);
  });

  it('muestra cada ruta con su cantidad y marca la elegida', async () => {
    await render(<RouteFilter buses={buses} routes={routes} value="route-norte" onChange={jest.fn()} />);

    expect(screen.getByText('Ruta:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todas las rutas, 3 micros' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Línea 1 — Centro, 2 micros' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Línea 2 — Norte, 1 micros' })).toBeSelected();
  });

  it('al tocar una ruta avisa cuál se eligió', async () => {
    const onChange = jest.fn();
    await render(<RouteFilter buses={buses} routes={routes} value="all" onChange={onChange} />);

    fireEvent.press(screen.getByRole('button', { name: /^Línea 2 — Norte/ }));
    expect(onChange).toHaveBeenCalledWith('route-norte');
  });
});
