import { CircleMarker, Popup } from 'react-leaflet';
import { ROUTE_NODES, ROUTE_NODE_COLORS, type RouteNode } from './routeNodes';

interface RouteNodesLayerProps {
  routeFilter: string;
}

const ROUTE_LABELS: Record<string, string> = {
  'route-7A': 'Línea 7A',
  'route-7B': 'Línea 7B',
  'route-1C': 'Línea 1C',
};

export function RouteNodesLayer({ routeFilter }: RouteNodesLayerProps) {
  const visibleNodes = routeFilter === 'all'
    ? ROUTE_NODES
    : ROUTE_NODES.filter((node) => node.routeIds.includes(routeFilter as RouteNode['routeIds'][number]));

  return (
    <>
      {visibleNodes.map((node) => {
        const color = ROUTE_NODE_COLORS[node.routeIds[0]];
        return (
          <CircleMarker
            key={node.id}
            center={node.position}
            radius={5}
            pathOptions={{
              color,
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{node.name}</strong>
              <br />
              <span>{node.routeIds.map((routeId) => ROUTE_LABELS[routeId]).join(' · ')}</span>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
