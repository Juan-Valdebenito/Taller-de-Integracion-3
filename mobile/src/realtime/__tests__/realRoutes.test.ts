import * as client from '../../api/client';
import { fetchRealRoutes, realRouteNames, routesToFollow } from '../realRoutes';

jest.mock('../../api/client', () => ({ apiRequest: jest.fn() }));

describe('rutas reales para el mapa', () => {
  it('trae solo las rutas activas de la base', async () => {
    jest.mocked(client.apiRequest).mockResolvedValue([
      { id: 'route-demo', code: 'L1-DEMO', name: 'Línea 1 Centro', isActive: true },
      { id: 'vieja', code: 'X', name: 'Antigua', isActive: false },
      { code: 'sin id' },
    ]);

    expect(await fetchRealRoutes()).toEqual([{ id: 'route-demo', code: 'L1-DEMO', name: 'Línea 1 Centro' }]);
    expect(client.apiRequest).toHaveBeenCalledWith('/routes');
  });

  it('escucha las 3 líneas del web más las reales, sin repetir', () => {
    expect(routesToFollow([{ id: 'route-demo', code: 'L1', name: 'Centro' }, { id: 'route-7A', code: '7A', name: 'x' }])).toEqual([
      'route-7A',
      'route-7B',
      'route-1C',
      'route-demo',
    ]);
  });

  it('nombra las rutas reales como las del web', () => {
    expect(realRouteNames([{ id: 'route-demo', code: 'L1-DEMO', name: 'Línea 1 Centro' }, { id: 'r2', code: '', name: '' }])).toEqual({
      'route-demo': 'Línea L1-DEMO — Línea 1 Centro',
      r2: 'Ruta r2',
    });
  });
});
