import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/** Alto de la barra de pestañas sin contar el margen inferior del teléfono. */
export const TAB_BAR_HEIGHT = 56;

/**
 * Colores y tipografía de las pestañas, iguales en las secciones de cada rol:
 * fondo --color-surface-1 con borde, como la barra del web.
 *
 * El alto por defecto de React Navigation (≈49) deja 10 px a la etiqueta, poco
 * para Inter de 11 px, que queda cortada: cada pestaña lleva 5 px de margen
 * arriba y abajo y 28 para el ícono. Con 56 (− 1 de borde) le quedan 17. Al
 * fijar el alto hay que sumar el margen inferior del teléfono (barra de inicio
 * del iPhone).
 */
export function useTabScreenOptions() {
  const { colors, font } = useTheme();
  const insets = useSafeAreaInsets();
  return {
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      height: TAB_BAR_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
    },
    headerTitleStyle: { fontFamily: 'Inter_700Bold', fontSize: font(17) },
    tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: font(11), lineHeight: font(16) },
  };
}
