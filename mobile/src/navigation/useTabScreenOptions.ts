import { useTheme } from '../theme';

/** Colores y tipografía de las pestañas, iguales en las secciones de cada rol. */
export function useTabScreenOptions() {
  const { colors, font } = useTheme();
  return {
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.muted,
    headerTitleStyle: { fontFamily: 'Inter_700Bold', fontSize: font(17) },
    tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: font(11) },
  };
}
