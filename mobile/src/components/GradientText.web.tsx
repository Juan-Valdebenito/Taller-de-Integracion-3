import { Text, type TextStyle } from 'react-native';

import type { GradientTextProps } from './GradientText';

/**
 * Versión web de GradientText: MaskedView no funciona en web, así que se usa
 * el mismo CSS que el frontend (`background-clip: text`).
 */
export function GradientText({ children, style, colors, direction = 'diagonal' }: GradientTextProps) {
  const gradient = {
    backgroundImage: `linear-gradient(${direction === 'horizontal' ? '90deg' : '135deg'}, ${colors.join(', ')})`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  } as unknown as TextStyle;
  return <Text style={[style, gradient]}>{children}</Text>;
}
