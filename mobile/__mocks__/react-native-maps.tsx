/**
 * Mock de react-native-maps para Jest (el mapa es un componente nativo). Jest
 * lo usa automáticamente: cada pieza se dibuja como un View con sus props, así
 * los tests pueden revisarlas (ej. la URL de los mosaicos).
 */
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

type Props = ViewProps & { children?: ReactNode; [prop: string]: unknown };

function mapPart(name: string) {
  function Part({ children, ...props }: Props) {
    return (
      <View testID={`map-${name}`} {...props}>
        {children}
      </View>
    );
  }
  Part.displayName = name;
  return Part;
}

const MapView = mapPart('MapView');
export default MapView;
export const UrlTile = mapPart('UrlTile');
export const Marker = mapPart('Marker');
export const Polyline = mapPart('Polyline');
export const Circle = mapPart('Circle');
export const Callout = mapPart('Callout');
export const PROVIDER_DEFAULT = undefined;
export const PROVIDER_GOOGLE = 'google';
