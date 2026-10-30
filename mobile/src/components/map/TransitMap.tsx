import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';

import { makeStyles, spacing } from '../../theme';
import { DEFAULT_ZOOM, MAX_ZOOM, OSM_ATTRIBUTION, OSM_TILE_URL, regionForZoom } from './mapConfig';

export interface TransitMapProps {
  /** Capas sobre el mapa (rutas, micros, ubicación). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mapa de Temuco con los mosaicos de OpenStreetMap, como el web (en iOS y
 * Android con react-native-maps; la versión web usa Leaflet, igual que el
 * frontend, en TransitMap.web.tsx).
 *
 * El web oscurece los mosaicos con un filtro CSS (brightness 0.72). Aquí no hay
 * filtros: se dibujan con opacidad 0.72 sobre el fondo oscuro del mapa.
 */
export function TransitMap({ children, style }: TransitMapProps) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.container, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Mapa de Temuco"
        initialRegion={regionForZoom(DEFAULT_ZOOM, width, height)}
        // En Android "none" quita el mapa de Google y deja solo los mosaicos de OSM.
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        userInterfaceStyle="dark"
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        // Botones + / − como el control de zoom del web (solo Android).
        zoomControlEnabled
      >
        <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={MAX_ZOOM} flipY={false} shouldReplaceMapContent opacity={0.72} />
        {children}
      </MapView>
      <Text style={styles.attribution}>{OSM_ATTRIBUTION}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  // Fondo del contenedor del mapa del web: hsl(220, 20%, 10%).
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#14171f' },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xs,
    fontSize: font(10),
    color: colors.muted,
    backgroundColor: 'rgba(16, 19, 24, 0.7)',
  },
}));
