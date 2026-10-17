import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing } from '../theme';
import { formatLongDate, initials, roleLabel } from '../utils/format';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Perfil del usuario con sesión iniciada. Los datos vienen de GET /auth/me: se
 * actualizan al entrar y al deslizar hacia abajo.
 */
export function ProfileScreen() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshUser();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo actualizar el perfil.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        testID="profile-scroll"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View style={styles.avatar} accessibilityLabel={`Avatar de ${user.name}`}>
            <Text style={styles.avatarText}>{initials(user.name)}</Text>
          </View>
          <Text style={styles.name} accessibilityRole="header">
            {user.name}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{roleLabel(user.role)}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Datos de la cuenta</Text>
        <View style={styles.card}>
          <InfoRow label="Correo electrónico" value={user.email} />
          <InfoRow label="Tipo de cuenta" value={roleLabel(user.role)} />
          <InfoRow label="Estado" value={user.isActive === false ? 'Desactivada' : 'Activa'} />
          {user.createdAt ? <InfoRow label="Miembro desde" value={formatLongDate(user.createdAt)} /> : null}
        </View>

        <Text style={styles.sectionTitle}>Seguridad</Text>
        <View style={styles.card}>
          <Text style={styles.securityText}>
            Tu sesión está guardada de forma cifrada en este dispositivo y se renueva automáticamente mientras uses la app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.background, fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  badge: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  error: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 14 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  row: { paddingVertical: spacing.sm },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 16, color: colors.text, fontWeight: '600', marginTop: 2 },
  securityText: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
