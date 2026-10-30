import { Circle, CircleMarker, Tooltip } from 'react-leaflet';

// Solo tipos desde './UserLocationLayer': en web esa ruta es este mismo archivo.
import { USER_LOCATION_COLOR } from './mapConfig';
import type { UserLocationLayerProps } from './UserLocationLayer';

/** Versión web de UserLocationLayer (Leaflet): círculo de precisión y punto azul. */
export function UserLocationLayer({ position }: UserLocationLayerProps) {
  if (!position) return null;
  const center: [number, number] = [position.latitude, position.longitude];
  return (
    <>
      {position.accuracy ? (
        <Circle
          center={center}
          radius={position.accuracy}
          pathOptions={{ color: USER_LOCATION_COLOR, opacity: 0.4, weight: 1, fillColor: USER_LOCATION_COLOR, fillOpacity: 0.12 }}
        />
      ) : null}
      <CircleMarker center={center} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: USER_LOCATION_COLOR, fillOpacity: 1 }}>
        <Tooltip>Tu ubicación</Tooltip>
      </CircleMarker>
    </>
  );
}
