import { ThemeProvider as NavigationThemeProvider, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { setupNotifications } from '../notifications/notificationService';
import { SettingsProvider, useSettings } from '../settings/SettingsContext';
import { ThemeProvider, useTheme } from '../theme';
import { navigationTheme } from '../theme/navigationTheme';

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

/** Navegación y barra de estado con el tema elegido en Configuración. */
function ThemedApp() {
  const theme = useTheme();

  useEffect(() => {
    // Canales de Android y notificaciones visibles con la app abierta.
    setupNotifications().catch(() => {});
  }, []);

  const navTheme = useMemo(() => navigationTheme(theme), [theme]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <RootNavigator />
      {/* Íconos de la barra de estado claros sobre fondo oscuro y viceversa. */}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
