import { View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import type { UserPosition } from '../../location/locationService';
import { USER_LOCATION_COLOR } from './mapConfig';

export interface UserLocationLayerProps {
  /** Posición del pasajero (useLocation); sin ella no se dibuja nada. */
  position: UserPosition | null;
}

/**
 * Tu ubicación en el mapa: punto azul con borde blanco y, si el GPS informa su
 * precisión, un círculo con ese radio (en metros). Usa la misma posición que
 * el paradero más cercano y las alertas. La versión web está en
 * UserLocationLayer.web.tsx.
 */
export function UserLocationLayer({ position }: UserLocationLayerProps) {
  if (!position) return null;
  const coordinate = { latitude: position.latitude, longitude: position.longitude };
  return (
    <>
      {position.accuracy ? (
        <Circle
          center={coordinate}
          radius={position.accuracy}
          strokeColor="rgba(43, 124, 238, 0.4)"
          fillColor="rgba(43, 124, 238, 0.12)"
          strokeWidth={1}
        />
      ) : null}
      <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} accessibilityLabel="Tu ubicación">
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            borderWidth: 3,
            borderColor: '#ffffff',
            backgroundColor: USER_LOCATION_COLOR,
            boxShadow: '0 0 0 4px rgba(43, 124, 238, 0.25)',
          }}
        />
      </Marker>
    </>
  );
}
