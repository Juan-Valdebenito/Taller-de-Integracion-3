import { CircleMarker, Popup } from 'react-leaflet';

import type { RouteNodesLayerProps } from './RouteNodesLayer';
import { routeLabelsOf, routeNodeColor, routeNodesForRoutes, visibleRouteNodes } from './routeNodes';

/** Versión web de RouteNodesLayer: el mismo código que el frontend (Leaflet). */
export function RouteNodesLayer({ routeFilter, routes }: RouteNodesLayerProps) {
  const nodes = visibleRouteNodes(routeNodesForRoutes(routes), routeFilter);
  return (
    <>
      {nodes.map((node) => (
        <CircleMarker
          key={node.id}
          center={node.position}
          radius={5}
          pathOptions={{ color: routeNodeColor(node.routeIds[0]), fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <strong>{node.name}</strong>
            <br />
            <span>{routeLabelsOf(node, routes)}</span>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
