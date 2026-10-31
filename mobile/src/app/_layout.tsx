import { useFonts } from '@expo-google-fonts/inter';
import { ThemeProvider as NavigationThemeProvider, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { setupNotifications } from '../notifications/notificationService';
import { SettingsProvider, useSettings } from '../settings/SettingsContext';
import { ThemeProvider, useTheme } from '../theme';
import { INTER_FONTS } from '../theme/fonts';
import { navigationTheme } from '../theme/navigationTheme';

// Mantener la pantalla de carga mientras se recuperan la sesión, las
// preferencias guardadas y la fuente Inter.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status, user } = useAuth();
  const { loaded: settingsLoaded } = useSettings();
  // Si Inter no carga (fontError), la app sigue con la fuente del sistema.
  const [fontsLoaded, fontError] = useFonts(INTER_FONTS);
  const ready = status !== 'loading' && settingsLoaded && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const signedIn = status === 'signedIn';
  const role = signedIn ? user?.role : undefined;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/*
        Una sección por rol, como el web (/passenger, /company, /admin). Cada
        usuario solo puede abrir la suya: al iniciar sesión Expo Router lo lleva
        a la primera disponible, que es la de su rol.
      */}
      <Stack.Protected guard={role === 'PASSENGER'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'COMPANY'}>
        <Stack.Screen name="company" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'ADMIN'}>
        <Stack.Screen name="admin" />
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
