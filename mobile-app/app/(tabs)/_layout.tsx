import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export default function TabLayout() {
  const theme = Colors.dark;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary300,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface1,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          // Subtle shadow for elevation
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        headerStyle: {
          backgroundColor: theme.surface1,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'grid-outline' as IoniconsName}
              size={size}
              color={typeof color === 'string' ? color : theme.textMuted}
            />
          ),
          headerTitle: '🚌 TransitHub',
        }}
      />
      <Tabs.Screen
        name="driver"
        options={{
          title: 'Conductor',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'navigate-outline' as IoniconsName}
              size={size}
              color={typeof color === 'string' ? color : theme.textMuted}
            />
          ),
          headerTitle: 'Modo Conductor',
        }}
      />
      <Tabs.Screen
        name="buses"
        options={{
          title: 'Micros',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'bus-outline' as IoniconsName}
              size={size}
              color={typeof color === 'string' ? color : theme.textMuted}
            />
          ),
          headerTitle: 'Flota de Micros',
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Rutas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'map-outline' as IoniconsName}
              size={size}
              color={typeof color === 'string' ? color : theme.textMuted}
            />
          ),
          headerTitle: 'Estado de Rutas',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'person-outline' as IoniconsName}
              size={size}
              color={typeof color === 'string' ? color : theme.textMuted}
            />
          ),
          headerTitle: 'Mi Perfil',
        }}
      />
    </Tabs>
  );
}
