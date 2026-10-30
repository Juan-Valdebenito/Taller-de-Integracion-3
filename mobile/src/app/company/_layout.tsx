import { Tabs } from 'expo-router/js-tabs';

import { tabEmoji } from '../../components/TabEmoji';
import { TopBar } from '../../components/TopBar';
import { useTabScreenOptions } from '../../navigation/useTabScreenOptions';

/** Sección de empresa (rol COMPANY), con el mismo menú que el portal de empresa del web. */
export default function CompanyLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={{ ...screenOptions, header: () => <TopBar variant="company" /> }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: 'Dashboard', tabBarIcon: tabEmoji('📊') }} />
      <Tabs.Screen name="driver" options={{ title: 'Conductor', headerTitle: 'Modo conductor', tabBarIcon: tabEmoji('🎛️') }} />
      <Tabs.Screen name="buses" options={{ title: 'Micros', headerTitle: 'Micros', tabBarIcon: tabEmoji('🚍') }} />
      <Tabs.Screen name="routes" options={{ title: 'Rutas', headerTitle: 'Rutas', tabBarIcon: tabEmoji('🗺️') }} />
      <Tabs.Screen name="complaints" options={{ title: 'Reclamos', headerTitle: 'Reclamos', tabBarIcon: tabEmoji('📋') }} />
    </Tabs>
  );
}
