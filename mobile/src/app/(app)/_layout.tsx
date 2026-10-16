import { Stack } from 'expo-router';

/** Rutas con sesión iniciada (protegidas en src/app/_layout.tsx). */
export default function AppLayout() {
  return <Stack screenOptions={{ title: 'TransitHub' }} />;
}
