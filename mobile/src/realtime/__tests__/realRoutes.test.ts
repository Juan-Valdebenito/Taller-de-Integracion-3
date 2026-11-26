import * as client from '../../api/client';
import { fetchRealRoutes, realRouteNames, routesToFollow, routesWithFallback, type RealRoute } from '../realRoutes';

jest.mock('../../api/client', () => ({ apiRequest: jest.fn() }));

describe('rutas reales para el mapa', () => {
  beforeEach(() => jest.mocked(client.apiRequest).mockReset());

  it('mantiene las tres opciones previas mientras el backend no entrega rutas', () => {
    expect(routesWithFallback([]).map((route) => route.id)).toEqual(['route-7A', 'route-7B', 'route-1C']);
    expect(routesToFollow([])).toEqual(['route-7A', 'route-7B', 'route-1C']);
  });

  it('trae solo las rutas activas y sus paraderos de la API', async () => {
    jest.mocked(client.apiRequest)
      .mockResolvedValueOnce([
        { id: 'route-demo', code: 'L1-DEMO', name: 'Línea 1 Centro', isActive: true },
        { id: 'vieja', code: 'X', name: 'Antigua', isActive: false },
        { code: 'sin id' },
      ])
      .mockResolvedValueOnce([
        { id: 'stop-1', name: 'Terminal', latitude: -38.73, longitude: -72.59, order: 1 },
      ]);

    expect(await fetchRealRoutes()).toEqual([{
      id: 'route-demo',
      code: 'L1-DEMO',
      name: 'Línea 1 Centro',
      label: 'Línea L1-DEMO — Línea 1 Centro',
      stops: [{ id: 'stop-1', name: 'Terminal', latitude: -38.73, longitude: -72.59, order: 1 }],
    }]);
    expect(client.apiRequest).toHaveBeenNthCalledWith(1, '/routes');
    expect(client.apiRequest).toHaveBeenNthCalledWith(2, '/routes/route-demo/stops');
  });

  it('mantiene las suscripciones de respaldo y agrega IDs reales sin duplicarlos', () => {
    const routes = [
      { id: 'route-demo', code: 'L1', name: 'Centro', label: 'Línea L1 — Centro', stops: [] },
      { id: 'route-demo', code: 'L1', name: 'Centro', label: 'Línea L1 — Centro', stops: [] },
      { id: 'route-2', code: '2', name: 'Norte', label: 'Línea 2 — Norte', stops: [] },
    ] satisfies RealRoute[];

    expect(routesToFollow(routes)).toEqual(['route-7A', 'route-7B', 'route-1C', 'route-demo', 'route-2']);
  });

  it('nombra las rutas desde el catálogo de la API', () => {
    const routes = [
      { id: 'route-demo', code: 'L1-DEMO', name: 'Línea 1 Centro', label: 'Línea L1-DEMO — Línea 1 Centro', stops: [] },
      { id: 'r2', code: '', name: '', label: 'Ruta r2', stops: [] },
    ] satisfies RealRoute[];

    expect(realRouteNames(routes)).toEqual({
      'route-demo': 'Línea L1-DEMO — Línea 1 Centro',
      r2: 'Ruta r2',
    });
  });
});
