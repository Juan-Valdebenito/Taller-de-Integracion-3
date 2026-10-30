import { useCallback } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { makeStyles, radius, spacing } from '../../theme';

export default function CompanyRoutesScreen() {
  const { user } = useAuth();
  const { routes, loading, error, refresh } = useCompanyOperations();
  const styles = useStyles();
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);
  if (user?.role !== 'COMPANY' && user?.role !== 'ADMIN') return <Redirect href="/(app)" />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}>
        <Text style={styles.heading}>Rutas de la empresa</Text>
        <Text style={styles.subheading}>{routes.length} rutas vinculadas a tu cuenta</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && routes.length === 0 && !error ? <Text style={styles.empty}>No hay rutas registradas para esta empresa.</Text> : null}
        {routes.map((route) => (
          <View key={route.id} style={styles.card}>
            <View style={styles.row}><Text style={styles.code}>{route.code}</Text><Text style={styles.status}>{route.isActive ? 'Activa' : 'Inactiva'}</Text></View>
            <Text style={styles.title}>{route.name}</Text>
            {route.description ? <Text style={styles.detail}>{route.description}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: font(25), fontWeight: '700' }, subheading: { color: colors.muted, fontSize: font(14), marginBottom: spacing.sm },
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: colors.primary, fontSize: font(14), fontWeight: '700' }, status: { color: colors.muted, fontSize: font(12) }, title: { color: colors.text, fontSize: font(17), fontWeight: '700' },
  detail: { color: colors.muted, fontSize: font(14) }, empty: { color: colors.muted, fontSize: font(14), paddingVertical: spacing.lg }, error: { color: colors.danger, fontSize: font(14) },
}));
