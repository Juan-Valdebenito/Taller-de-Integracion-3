import { Text } from 'react-native';

/**
 * Ícono de pestaña con emoji, como los menús del web (📊 Dashboard, 🚍 Micros…).
 * La pestaña activa se ve opaca y las demás atenuadas.
 */
export function tabEmoji(emoji: string) {
  return function TabEmojiIcon({ focused }: { focused: boolean }) {
    return (
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }} importantForAccessibility="no" accessibilityElementsHidden>
        {emoji}
      </Text>
    );
  };
}
