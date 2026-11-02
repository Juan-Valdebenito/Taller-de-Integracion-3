import { Tabs } from 'expo-router/js-tabs';

import { tabEmoji } from '../../components/TabEmoji';
import { TopBar } from '../../components/TopBar';
import { useTabScreenOptions } from '../../navigation/useTabScreenOptions';

/**
 * Sección del pasajero (rol PASSENGER), con el menú del web (🗺️ Mapa ·
 * 📋 Reclamos) más Perfil y Configuración, que son propios de la app.
 * Empresa y administración tienen las suyas (app/company, app/admin).
 */
export default function AppLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={{ ...screenOptions, header: () => <TopBar variant="passenger" /> }}>
      <Tabs.Screen name="index" options={{ title: 'Mapa', headerTitle: 'Mapa', tabBarIcon: tabEmoji('🗺️') }} />
      <Tabs.Screen name="complaints" options={{ title: 'Reclamos', headerTitle: 'Mis Reclamos', tabBarIcon: tabEmoji('📋') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', headerTitle: 'Mi perfil', tabBarIcon: tabEmoji('👤') }} />
      <Tabs.Screen name="settings" options={{ title: 'Configuración', headerTitle: 'Configuración', tabBarIcon: tabEmoji('⚙️') }} />
    </Tabs>
  );
}
