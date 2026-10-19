import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { SettingsProvider, useSettings } from '../settings/SettingsContext';

// Mantener la pantalla de carga mientras se recuperan la sesión y las preferencias guardadas.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const { loaded: settingsLoaded } = useSettings();
  const ready = status !== 'loading' && settingsLoaded;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Con sesión: la app. Sin sesión, estas rutas redirigen al login. */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Sin sesión: login y registro. Con sesión, redirigen a la app. */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SettingsProvider>
  );
}
