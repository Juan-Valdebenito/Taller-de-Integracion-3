import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { LocationCard } from '../components/LocationCard';
import { NearbyStopCard } from '../components/NearbyStopCard';
import { ProximityAlertsCard } from '../components/ProximityAlertsCard';
import { useLocation } from '../hooks/useLocation';
import { useNearestStop } from '../hooks/useNearestStop';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { colors, radius, spacing } from '../theme';
import { roleLabel } from '../utils/format';

/** Pantalla inicial con sesión iniciada. El cierre de sesión está en la pestaña Perfil. */
export function HomeScreen() {
  const { user } = useAuth();
  const location = useLocation();
  const nearby = useNearestStop(location.position);
  const alerts = useProximityAlerts(nearby.proximity);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting} accessibilityRole="header">
          Hola, {user?.name ?? 'pasajero'}
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>Correo</Text>
          <Text style={styles.value}>{user?.email}</Text>
          <Text style={[styles.label, styles.spaced]}>Tipo de cuenta</Text>
          <Text style={styles.value}>{roleLabel(user?.role)}</Text>
        </View>
        <LocationCard location={location} />
        <NearbyStopCard nearby={nearby} hasPosition={location.position !== null} />
        <ProximityAlertsCard alerts={alerts} />
        <Text style={styles.hint}>Revisa tus datos o cierra sesión desde la pestaña Perfil.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg },
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 2 },
  spaced: { marginTop: spacing.md },
  hint: { marginTop: spacing.md, color: colors.muted, fontSize: 13 },
});
