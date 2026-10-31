/**
 * Mock de @expo/vector-icons para Jest: los íconos cargan su fuente como
 * recurso (expo-asset), que en los tests no existe. Jest lo usa
 * automáticamente; cada ícono se dibuja como un Text con su nombre.
 */
import { Text } from 'react-native';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

function makeIcon(family: string) {
  function Icon({ name }: IconProps) {
    return (
      <Text testID={`icon-${name}`} importantForAccessibility="no" accessibilityElementsHidden>
        {`${family}:${name}`}
      </Text>
    );
  }
  Icon.displayName = family;
  return Icon;
}

export const Ionicons = makeIcon('Ionicons');
export const MaterialIcons = makeIcon('MaterialIcons');
export const MaterialCommunityIcons = makeIcon('MaterialCommunityIcons');
export const FontAwesome = makeIcon('FontAwesome');
