import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { LocationCard } from '../components/LocationCard';
import { useLocation } from '../hooks/useLocation';
import { colors, radius, spacing } from '../theme';
import { roleLabel } from '../utils/format';

/** Pantalla inicial con sesión iniciada. El cierre de sesión está en la pestaña Perfil. */
export function HomeScreen() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={styles.content}>
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
        <Text style={styles.hint}>Revisa tus datos o cierra sesión desde la pestaña Perfil.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg },
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  label: { fontSize: 13, color: colors.muted },
  value: { fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 2 },
  spaced: { marginTop: spacing.md },
  hint: { marginTop: spacing.md, color: colors.muted, fontSize: 13 },
});
