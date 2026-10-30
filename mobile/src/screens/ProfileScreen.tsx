import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { formatLongDate, initials, roleLabel } from '../utils/format';
import { confirmAction } from '../utils/platform';

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
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
  const { colors } = useTheme();
  const styles = useStyles();
  const { user, refreshUser, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Envía el access y el refresh token a la lista negra del backend Go
  // (POST /auth/logout) y borra la sesión del dispositivo. Al cambiar la
  // sesión, Stack.Protected lleva al login.
  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  const confirmSignOut = useCallback(() => {
    confirmAction({
      title: 'Cerrar sesión',
      message: '¿Quieres cerrar tu sesión en este dispositivo?',
      confirmText: 'Cerrar sesión',
      destructive: true,
      onConfirm: doSignOut,
    });
  }, [doSignOut]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.avatar} accessibilityLabel={`Avatar de ${user.name}`}>
            {/* Círculo de tamaño fijo: se limita el aumento de letra del sistema para que las iniciales quepan. */}
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.3}>
              {initials(user.name)}
            </Text>
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

        <View style={styles.signOut}>
          <Button title="Cerrar sesión" variant="danger" onPress={confirmSignOut} loading={signingOut} />
          <Text style={styles.signOutHint}>
            Al cerrar sesión, tus tokens se invalidan en el servidor y se borran de este dispositivo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors, font) => ({
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
  avatarText: { color: colors.onPrimary, fontSize: font(32), fontWeight: '700' },
  name: { fontSize: font(22), fontWeight: '700', color: colors.text, textAlign: 'center' },
  badge: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: colors.accent, fontWeight: '600', fontSize: font(13) },
  error: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: font(14) },
  sectionTitle: {
    fontSize: font(13),
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  row: { paddingVertical: spacing.sm },
  rowLabel: { fontSize: font(13), color: colors.muted },
  rowValue: { fontSize: font(16), color: colors.text, fontWeight: '600', marginTop: 2 },
  securityText: { fontSize: font(14), color: colors.text, lineHeight: font(20) },
  signOut: { marginTop: spacing.md },
  signOutHint: { marginTop: spacing.sm, fontSize: font(13), color: colors.muted, textAlign: 'center' },
}));
