import { Text, View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';

import type { RealRoute } from '../../realtime/realRoutes';
import { makeStyles, radius, spacing } from '../../theme';
import { routeLabelsOf, routeNodeColor, routeNodesForRoutes, visibleRouteNodes, type RouteFilterValue } from './routeNodes';

export interface RouteNodesLayerProps {
  routeFilter: RouteFilterValue;
  routes: readonly RealRoute[];
}

/**
 * Paradas de las líneas sobre el mapa, como RouteNodesLayer del web: círculo
 * blanco de 5 px de radio con borde del color de la primera línea y, al
 * tocarlo, el nombre y las líneas. La versión web (Leaflet) está en
 * RouteNodesLayer.web.tsx.
 */
export function RouteNodesLayer({ routeFilter, routes }: RouteNodesLayerProps) {
  const styles = useStyles();
  const nodes = visibleRouteNodes(routeNodesForRoutes(routes), routeFilter);
  return (
    <>
      {nodes.map((node) => (
        <Marker
          key={node.id}
          coordinate={{ latitude: node.position[0], longitude: node.position[1] }}
          anchor={{ x: 0.5, y: 0.5 }}
          // El dibujo no cambia: no hace falta volver a capturarlo (más fluido).
          tracksViewChanges={false}
          accessibilityLabel={`Parada ${node.name}: ${routeLabelsOf(node, routes)}`}
        >
          <View style={[styles.dot, { borderColor: routeNodeColor(node.routeIds[0]) }]} />
          <Callout tooltip>
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>{node.name}</Text>
              <Text style={styles.popupText}>{routeLabelsOf(node, routes)}</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </>
  );
}

// Ventanita oscura como el popup del web (.leaflet-popup-content-wrapper).
const useStyles = makeStyles((_colors, font) => ({
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: '#ffffff' },
  popup: {
    maxWidth: 240,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#1d212b', // hsl(220, 20%, 14%)
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  popupTitle: { fontSize: font(13), fontWeight: '700', color: '#f1f5f9' },
  popupText: { fontSize: font(12), color: '#f1f5f9', marginTop: 2 },
}));
