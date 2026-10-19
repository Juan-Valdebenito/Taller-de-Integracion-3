import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import Colors from '@/constants/Colors';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Custom dark theme matching TransitHub brand
const TransitHubDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary:      Colors.dark.primary400,
    background:   Colors.dark.bgDeep,
    card:         Colors.dark.surface1,
    text:         Colors.dark.textPrimary,
    border:       Colors.dark.border,
    notification: Colors.dark.primary300,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={TransitHubDarkTheme}>
      <StatusBar style="light" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Información',
            headerStyle: { backgroundColor: Colors.dark.surface1 },
            headerTintColor: Colors.dark.textPrimary,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
