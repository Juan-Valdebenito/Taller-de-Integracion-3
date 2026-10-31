import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { countUsers, EMPTY_USER_FILTERS, filterUsers, USER_ROLE, USER_ROLE_OPTIONS, USER_STATUS_OPTIONS, type AdminUserRow, type UserFilters } from '../admin/users';
import { useAuth } from '../auth/AuthContext';
import { SelectField } from '../components/SelectField';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { makeStyles, radius, spacing, useTheme } from '../theme';

// Colores del web: hsl(142,71%,45%), hsl(220,10%,50%) y hsl(0,84%,60%).
const GREEN = '#22c55e';
const GREY = '#737d8c';
const RED = '#ef4444';

/**
 * Gestión de usuarios (administrador), como AdminUsersPage del web: cuántos
 * hay de cada rol, buscador, filtros por rol y estado, y una tarjeta por
 * cuenta (la tabla del web no cabe en un teléfono). Editar, activar y crear
 * llegan aparte.
 */
export function AdminUsersScreen() {
  const { users, loading, error, refresh } = useAdminUsers();
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filters, setFilters] = useState<UserFilters>(EMPTY_USER_FILTERS);
  const visible = useMemo(() => filterUsers(users, filters), [users, filters]);
  const counts = countUsers(users);
  const chips = [
    { label: `${counts.ADMIN} Admins`, color: USER_ROLE.ADMIN.color },
    { label: `${counts.COMPANY} Empresas`, color: USER_ROLE.COMPANY.color },
    { label: `${counts.PASSENGER} Pasajeros`, color: USER_ROLE.PASSENGER.color },
    { label: `${counts.inactive} Inactivos`, color: RED },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <Text style={styles.title} accessibilityRole="header">Gestión de Usuarios</Text>
        <Text style={styles.subtitle}>{users.length} usuarios registrados en el sistema</Text>

        <View style={styles.chips}>
          {chips.map((chip) => (
            <Badge key={chip.label} label={chip.label} color={chip.color} />
          ))}
        </View>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.search}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={filters.search}
            onChangeText={(search) => setFilters((f) => ({ ...f, search }))}
            placeholder="Buscar por nombre o email..."
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Buscar usuario"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        <SelectField label="Rol" value={filters.role} options={USER_ROLE_OPTIONS} onChange={(role) => setFilters((f) => ({ ...f, role }))} />
        <SelectField label="Estado" value={filters.status} options={USER_STATUS_OPTIONS} onChange={(status) => setFilters((f) => ({ ...f, status }))} />

        {loading && users.length === 0 ? (
          <Text style={styles.empty}>Cargando usuarios...</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{error ? '' : 'No se encontraron usuarios'}</Text>
        ) : (
          <>
            {visible.map((user) => (
              <UserCard key={user.id} user={user} isMe={user.id === me?.id} />
            ))}
            <Text style={styles.footer}>
              Mostrando {visible.length} de {users.length} usuarios
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const styles = useStyles();
  return <Text style={[styles.badge, { color, backgroundColor: `${color}18`, borderColor: `${color}33` }]}>{label}</Text>;
}

function UserCard({ user, isMe }: { user: AdminUserRow; isMe: boolean }) {
  const styles = useStyles();
  const role = USER_ROLE[user.role];
  return (
    <View
      style={[styles.card, !user.isActive && styles.cardInactive]}
      accessible
      accessibilityLabel={`${user.name}${isMe ? ' (tú)' : ''}, ${user.email}, ${role.label}${user.companyName ? ` de ${user.companyName}` : ''}, ${user.isActive ? 'activo' : 'inactivo'}, registrado ${user.registered}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: `${role.color}22`, borderColor: `${role.color}44` }]}>
          <Text style={[styles.avatarText, { color: role.color }]}>{user.initials}</Text>
        </View>
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
            {isMe ? <Text style={styles.me}> (tú)</Text> : null}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
      </View>
      <View style={styles.badges}>
        <Badge label={role.label} color={role.color} />
        <Badge label={user.isActive ? 'Activo' : 'Inactivo'} color={user.isActive ? GREEN : GREY} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>🏢 {user.companyName ?? '—'}</Text>
        <Text style={styles.metaText}>📅 {user.registered}</Text>
      </View>
    </View>
  );
}

// Medidas de AdminUsersPage del web.
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.xs, color: colors.muted, fontSize: font(14) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: spacing.md, marginBottom: spacing.lg },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    fontSize: font(11),
    fontWeight: '600',
    overflow: 'hidden',
  },
  error: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger, fontSize: font(14), lineHeight: font(20) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: font(14) },
  empty: { paddingVertical: 48, textAlign: 'center', color: colors.placeholder, fontSize: font(14) },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardInactive: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: font(12), fontWeight: '700' },
  who: { flex: 1 },
  name: { color: colors.text, fontSize: font(14), fontWeight: '600' },
  me: { color: colors.placeholder, fontWeight: '400' },
  email: { marginTop: 1, color: colors.placeholder, fontSize: font(11) },
  badges: { flexDirection: 'row', gap: spacing.sm },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  metaText: { flexShrink: 1, color: colors.muted, fontSize: font(12) },
  footer: { marginTop: spacing.xs, textAlign: 'center', color: colors.placeholder, fontSize: font(12) },
}));
