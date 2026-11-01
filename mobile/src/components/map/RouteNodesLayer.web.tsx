import { CircleMarker, Popup } from 'react-leaflet';

import type { RouteNodesLayerProps } from './RouteNodesLayer';
import { ROUTE_NODE_COLORS, routeLabelsOf, visibleRouteNodes } from './routeNodes';

/** Versión web de RouteNodesLayer: el mismo código que el frontend (Leaflet). */
export function RouteNodesLayer({ routeFilter }: RouteNodesLayerProps) {
  return (
    <>
      {visibleRouteNodes(routeFilter).map((node) => (
        <CircleMarker
          key={node.id}
          center={node.position}
          radius={5}
          pathOptions={{ color: ROUTE_NODE_COLORS[node.routeIds[0]], fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <strong>{node.name}</strong>
            <br />
            <span>{routeLabelsOf(node)}</span>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
