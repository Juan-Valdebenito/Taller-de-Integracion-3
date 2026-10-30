import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

export default function CompanyOperationsScreen() {
  const { user } = useAuth();
  const { buses, routes, loading, error, refresh } = useCompanyOperations();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  const active = buses.filter((bus) => bus.status === 'ACTIVE').length;
  const unavailable = buses.filter((bus) => bus.status === 'MAINTENANCE' || bus.status === 'OUT_OF_SERVICE').length;
  const passengers = buses.reduce((total, bus) => total + bus.currentPassengers, 0);
  const capacity = buses.reduce((total, bus) => total + bus.capacity, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <Text style={styles.heading}>Hola, {user?.name ?? 'empresa'}</Text>
        <Text style={styles.subtitle}>{user?.companyId ? 'Resumen de tu empresa' : 'Resumen de operación'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.stats}>
          <Stat label="Micros" value={buses.length} />
          <Stat label="En servicio" value={active} />
          <Stat label="Rutas" value={routes.length} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ocupación actual</Text>
          <Text style={styles.occupancy}>{passengers} / {capacity} pasajeros</Text>
          <Text style={styles.detail}>{unavailable} micros fuera de operación</Text>
        </View>
        <Pressable onPress={() => router.push('/company/buses')} style={styles.linkCard}>
          <View><Text style={styles.cardTitle}>Administrar flota</Text><Text style={styles.detail}>{buses.length} micros disponibles</Text></View>
          <Text style={styles.link}>Ver flota ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/company/routes')} style={styles.linkCard}>
          <View><Text style={styles.cardTitle}>Consultar rutas</Text><Text style={styles.detail}>{routes.filter((route) => route.isActive).length} rutas activas</Text></View>
          <Text style={styles.link}>Ver rutas ›</Text>
        </Pressable>
        {error ? <Pressable onPress={() => void refresh()}><Text style={styles.link}>Reintentar</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: font(25), fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: font(14), marginBottom: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm }, stat: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: font(22), fontWeight: '700' }, statLabel: { color: colors.muted, fontSize: font(12), textAlign: 'center' },
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.xs }, cardTitle: { color: colors.text, fontSize: font(16), fontWeight: '700' },
  occupancy: { color: colors.accent, fontSize: font(22), fontWeight: '700' }, detail: { color: colors.muted, fontSize: font(13) },
  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  link: { color: colors.accent, fontSize: font(14), fontWeight: '700' }, error: { color: colors.danger, fontSize: font(14) },
}));
