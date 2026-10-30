import { useCallback } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

const statusLabel: Record<string, string> = {
  ACTIVE: 'En servicio', INACTIVE: 'Disponible', MAINTENANCE: 'Mantenimiento', OUT_OF_SERVICE: 'Fuera de servicio',
};

export default function CompanyBusesScreen() {
  const { buses, loading, error, refresh } = useCompanyOperations();
  const styles = useStyles();
  const { colors } = useTheme();
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <Text style={styles.heading}>Flota de micros</Text>
        <Text style={styles.subheading}>{buses.length} unidades asociadas a la empresa</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && buses.length === 0 && !error ? <Text style={styles.empty}>No hay micros registradas para esta empresa.</Text> : null}
        {buses.map((bus) => (
          <View key={bus.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{bus.patente}</Text>
              <Text style={[styles.badge, { color: bus.status === 'ACTIVE' ? colors.accent : colors.muted }]}>{statusLabel[bus.status] ?? bus.status}</Text>
            </View>
            <Text style={styles.detail}>Pasajeros: {bus.currentPassengers} / {bus.capacity}</Text>
            <Text style={styles.detail}>Ocupación: {bus.capacity > 0 ? Math.round((bus.currentPassengers / bus.capacity) * 100) : 0}%</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: font(25), fontWeight: '700' }, subheading: { color: colors.muted, fontSize: font(14), marginBottom: spacing.sm },
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.xs }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: font(17), fontWeight: '700' }, badge: { fontSize: font(12), fontWeight: '700' }, detail: { color: colors.muted, fontSize: font(14) },
  empty: { color: colors.muted, fontSize: font(14), paddingVertical: spacing.lg }, error: { color: colors.danger, fontSize: font(14) },
}));
