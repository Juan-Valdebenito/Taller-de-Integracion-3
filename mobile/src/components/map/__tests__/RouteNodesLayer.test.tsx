import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { RealRoute } from '../../../realtime/realRoutes';
import { RouteNodesLayer } from '../RouteNodesLayer';
import { routeLabelsOf, routeNodeColor, routeNodesForRoutes, visibleRouteNodes } from '../routeNodes';

const routes: RealRoute[] = [
  {
    id: 'route-centro',
    code: '1',
    name: 'Centro',
    label: 'Línea 1 — Centro',
    stops: [
      { id: 'shared', name: 'Terminal', latitude: -38.73, longitude: -72.59, order: 1 },
      { id: 'centro-only', name: 'Plaza', latitude: -38.74, longitude: -72.58, order: 2 },
    ],
  },
  {
    id: 'route-norte',
    code: '2',
    name: 'Norte',
    label: 'Línea 2 — Norte',
    stops: [
      { id: 'shared', name: 'Terminal', latitude: -38.73, longitude: -72.59, order: 1 },
      { id: 'norte-only', name: 'Hospital', latitude: -38.72, longitude: -72.57, order: 2 },
      { id: 'invalid', name: 'Coordenada inválida', latitude: Number.NaN, longitude: -72.57, order: 3 },
    ],
  },
];

describe('routeNodes', () => {
  it('conserva las siete paradas originales cuando aún no hay catálogo real', () => {
    const nodes = routeNodesForRoutes([]);

    expect(nodes).toHaveLength(7);
    expect(visibleRouteNodes(nodes, 'route-7A')).toHaveLength(4);
    expect(visibleRouteNodes(nodes, 'route-7B')).toHaveLength(5);
    expect(visibleRouteNodes(nodes, 'route-1C')).toHaveLength(5);
  });

  it('usa paraderos reales por línea y conserva el respaldo en las rutas aún incompletas', () => {
    const nodes = routeNodesForRoutes([{ ...routes[0], id: 'route-7A' }]);
    expect(nodes.some((node) => node.id === 'PAR-CJP-02' && node.routeIds.includes('route-7A'))).toBe(false);
    expect(nodes.some((node) => node.id === 'PAR-CJP-01' && node.routeIds.includes('route-7B'))).toBe(true);
    expect(nodes.some((node) => node.id === 'PAR-CJP-01' && node.routeIds.includes('route-7A'))).toBe(false);
  });

  it('agrupa paraderos compartidos desde el catálogo real y descarta coordenadas inválidas', () => {
    const nodes = routeNodesForRoutes(routes).filter((node) => node.routeIds.some((id) => ['route-centro', 'route-norte'].includes(id)));

    expect(nodes.map((node) => node.id)).toEqual([
      'shared:-38.73:-72.59',
      'centro-only:-38.74:-72.58',
      'norte-only:-38.72:-72.57',
    ]);
    expect(nodes[0].routeIds).toEqual(['route-centro', 'route-norte']);
    expect(nodes[0].name).toBe('Terminal');
  });

  it('filtra los paraderos por ruta y muestra los nombres del catálogo', () => {
    const nodes = routeNodesForRoutes(routes);

    expect(visibleRouteNodes(nodes, 'all')).toHaveLength(10);
    expect(visibleRouteNodes(nodes, 'route-centro')).toHaveLength(2);
    const shared = nodes.find((node) => node.id.startsWith('shared:'))!;
    expect(routeLabelsOf(shared, routes)).toBe('Línea 1 — Centro · Línea 2 — Norte');
  });

  it('asigna un color estable sin depender de IDs de rutas de ejemplo', () => {
    expect(routeNodeColor('route-centro')).toBe(routeNodeColor('route-centro'));
    expect(routeNodeColor('route-centro')).not.toBe(routeNodeColor('route-norte'));
  });
});

describe('RouteNodesLayer', () => {
  it('dibuja las posiciones reales, junta líneas compartidas y abre detalles', async () => {
    await render(<RouteNodesLayer routeFilter="all" routes={routes} />);

    const markers = screen.getAllByTestId('map-Marker');
    expect(markers).toHaveLength(10); // 7 paradas de respaldo + 3 reales
    expect(markers.find((marker) => marker.props.coordinate.latitude === -38.73)?.props.coordinate).toEqual({
      latitude: -38.73,
      longitude: -72.59,
    });
    expect(screen.getByLabelText('Parada Terminal: Línea 1 — Centro · Línea 2 — Norte')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
  });

  it('filtra los paraderos por la ruta elegida y mantiene el color del marcador', async () => {
    await render(<RouteNodesLayer routeFilter="route-centro" routes={routes} />);

    expect(screen.getAllByTestId('map-Marker')).toHaveLength(2);
    expect(screen.queryByText('Hospital')).toBeNull();

    const dot = StyleSheet.flatten(screen.getAllByTestId('map-Marker')[0].props.children[0].props.style);
    expect(dot).toMatchObject({ backgroundColor: '#ffffff', borderWidth: 2, borderColor: routeNodeColor('route-centro') });
  });
});
