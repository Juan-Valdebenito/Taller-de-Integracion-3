/**
 * Configuración del mapa, igual a PassengerMapPage del web: centro en la Plaza
 * de Armas de Temuco, zoom 14 y mosaicos de OpenStreetMap.
 */

/** Plaza de Armas de Temuco (el centro del mapa del web). */
export const TEMUCO_CENTER = { latitude: -38.7359, longitude: -72.5904 } as const;

/** Zoom inicial del web (Leaflet). */
export const DEFAULT_ZOOM = 14;

export const MAX_ZOOM = 19;

/** Mosaicos de OpenStreetMap (la URL sin subdominio que recomienda su política de uso). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Atribución que exige la licencia de OpenStreetMap. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Región de react-native-maps equivalente a un zoom de Leaflet: en el zoom z
 * el mundo mide 256·2^z px, así que un ancho de `widthPx` cubre
 * 360·widthPx / (256·2^z) grados de longitud.
 */
export function regionForZoom(zoom: number, widthPx: number, heightPx: number) {
  const longitudeDelta = (360 * widthPx) / (256 * 2 ** zoom);
  // Mercator: un grado de latitud se ve 1/cos(lat) veces más alto.
  const latitudeDelta = longitudeDelta * (heightPx / widthPx) * Math.cos((TEMUCO_CENTER.latitude * Math.PI) / 180);
  return { ...TEMUCO_CENTER, latitudeDelta, longitudeDelta };
}
