import 'leaflet/dist/leaflet.css';
import './TransitMap.web.css';

import { MapContainer, TileLayer } from 'react-leaflet';
import { View } from 'react-native';

import { DEFAULT_ZOOM, MAX_ZOOM, OSM_TILE_URL, TEMUCO_CENTER } from './mapConfig';
import type { TransitMapProps } from './TransitMap';

/**
 * Versión web de TransitMap: Leaflet con el mismo centro, zoom, mosaicos y
 * estilos que el mapa del frontend (react-native-maps no funciona en web).
 */
export function TransitMap({ children, style }: TransitMapProps) {
  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, style]} accessibilityLabel="Mapa de Temuco">
      <MapContainer
        center={[TEMUCO_CENTER.latitude, TEMUCO_CENTER.longitude]}
        zoom={DEFAULT_ZOOM}
        zoomControl
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url={OSM_TILE_URL}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={MAX_ZOOM}
        />
        {children}
      </MapContainer>
    </View>
  );
}
