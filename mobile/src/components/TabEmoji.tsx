import { Text } from 'react-native';

/**
 * Ícono de pestaña con emoji, como los menús del web (📊 Dashboard, 🚍 Micros…).
 * La pestaña activa se ve opaca y las demás atenuadas.
 */
export function tabEmoji(emoji: string) {
  return function TabEmojiIcon({ focused }: { focused: boolean }) {
    return (
      // Alto de línea fijo: con el de por defecto el emoji ocupa tanto que la
      // etiqueta de la pestaña queda cortada abajo.
      <Text style={{ fontSize: 18, lineHeight: 22, opacity: focused ? 1 : 0.55 }} importantForAccessibility="no" accessibilityElementsHidden>
        {emoji}
      </Text>
    );
  };
}
