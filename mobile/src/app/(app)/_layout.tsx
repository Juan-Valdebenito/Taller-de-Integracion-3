import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme';

/** Rutas con sesión iniciada: las cuentas de empresa también ven flota, rutas y modo conductor. */
export default function AppLayout() {
  const { colors, font } = useTheme();
  const { user } = useAuth();
  const canOperate = user?.role === 'COMPANY' || user?.role === 'ADMIN';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { fontWeight: '700', fontSize: font(17) },
        tabBarLabelStyle: { fontSize: font(11) },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerTitle: 'TransitHub',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          title: 'Empresa',
          headerTitle: 'Operación de empresa',
          href: canOperate ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'business' : 'business-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="driver"
        options={{
          title: 'Conductor',
          headerTitle: 'Modo conductor',
          href: canOperate ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          headerTitle: 'Mi perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Configuración',
          headerTitle: 'Configuración',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
