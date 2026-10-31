import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RouteNodesLayer } from '../RouteNodesLayer';
import { ROUTE_NODE_COLORS, ROUTE_NODES, routeLabelsOf, visibleRouteNodes } from '../routeNodes';

describe('routeNodes', () => {
  it('tiene las 7 paradas del web con sus líneas', () => {
    expect(ROUTE_NODES.map((n) => n.id)).toEqual([
      'PAR-CJP-01',
      'PAR-CJP-02',
      'PAR-BARROS-01',
      'PAR-MRODRI-01',
      'PAR-DPORT-01',
      'PAR-CSF-01',
      'PAR-PORTAL-01',
    ]);
    expect(ROUTE_NODES.find((n) => n.id === 'PAR-DPORT-01')).toEqual({
      id: 'PAR-DPORT-01',
      routeIds: ['route-7A', 'route-7B', 'route-1C'],
      name: 'Diego Portales / McDonalds',
      position: [-38.737505, -72.589278],
    });
  });

  it('usa los colores del web por línea', () => {
    expect(ROUTE_NODE_COLORS).toEqual({ 'route-7A': '#f97316', 'route-7B': '#0ea5e9', 'route-1C': '#22c55e' });
  });

  it.each([
    ['all', 7],
    ['route-7A', 4],
    ['route-7B', 5],
    ['route-1C', 5],
  ] as const)('con el filtro %s muestra %i paradas', (filter, count) => {
    expect(visibleRouteNodes(filter)).toHaveLength(count);
  });

  it('el texto de la ventanita junta las líneas con " · "', () => {
    expect(routeLabelsOf(ROUTE_NODES[6])).toBe('Línea 7B · Línea 1C');
  });
});

describe('RouteNodesLayer', () => {
  it('dibuja una parada por nodo en su posición, accesible por nombre y líneas', async () => {
    await render(<RouteNodesLayer routeFilter="all" />);

    const markers = screen.getAllByTestId('map-Marker');
    expect(markers).toHaveLength(7);
    expect(markers[0].props.coordinate).toEqual({ latitude: -38.703959, longitude: -72.550509 });
    expect(screen.getByLabelText('Parada Avenida Alemania / Portal Temuco: Línea 7B · Línea 1C')).toBeTruthy();
  });

  it('el círculo es blanco con el borde del color de su primera línea', async () => {
    await render(<RouteNodesLayer routeFilter="route-7A" />);

    const dot = StyleSheet.flatten(screen.getAllByTestId('map-Marker')[0].props.children[0].props.style);
    expect(dot).toMatchObject({ backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#f97316' });
  });

  it('al tocar una parada muestra su nombre y líneas', async () => {
    await render(<RouteNodesLayer routeFilter="route-1C" />);

    expect(screen.getByText('Avenida Barros Arana / Loteo Valle Verde')).toBeTruthy();
    expect(screen.getAllByTestId('map-Callout')).toHaveLength(5);
  });

  it('respeta el filtro de ruta', async () => {
    await render(<RouteNodesLayer routeFilter="route-7A" />);

    expect(screen.getAllByTestId('map-Marker')).toHaveLength(4);
    expect(screen.queryByText('Campus San Juan Pablo II')).toBeNull();
  });
});
