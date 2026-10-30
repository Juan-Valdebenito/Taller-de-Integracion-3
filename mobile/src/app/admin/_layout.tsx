import { Tabs } from 'expo-router/js-tabs';

import { tabEmoji } from '../../components/TabEmoji';
import { TopBar } from '../../components/TopBar';
import { useTabScreenOptions } from '../../navigation/useTabScreenOptions';

/** Sección de administración (rol ADMIN), con el mismo menú que el panel del web. */
export default function AdminLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={{ ...screenOptions, header: () => <TopBar variant="admin" /> }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: 'Dashboard', tabBarIcon: tabEmoji('📊') }} />
      <Tabs.Screen name="companies" options={{ title: 'Empresas', headerTitle: 'Empresas', tabBarIcon: tabEmoji('🏢') }} />
      <Tabs.Screen name="routes" options={{ title: 'Rutas', headerTitle: 'Rutas', tabBarIcon: tabEmoji('🗺️') }} />
      <Tabs.Screen name="users" options={{ title: 'Usuarios', headerTitle: 'Usuarios', tabBarIcon: tabEmoji('👥') }} />
      <Tabs.Screen name="complaints" options={{ title: 'Reclamos', headerTitle: 'Reclamos', tabBarIcon: tabEmoji('📋') }} />
    </Tabs>
  );
}
