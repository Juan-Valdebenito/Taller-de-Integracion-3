import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deactivateUser, updateUser } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { countUsers, EMPTY_USER_FILTERS, filterUsers, USER_ROLE, USER_ROLE_OPTIONS, USER_STATUS_OPTIONS, type AdminUserRow, type UserFilters } from '../admin/users';
import { useAuth } from '../auth/AuthContext';
import { SelectField } from '../components/SelectField';
import { UserForm } from '../components/UserForm';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { confirmAction } from '../utils/platform';

// Colores del web: hsl(142,71%,45%), hsl(220,10%,50%) y hsl(0,84%,60%).
const GREEN = '#22c55e';
const GREY = '#737d8c';
const RED = '#ef4444';

/**
 * Gestión de usuarios (administrador), como AdminUsersPage del web: cuántos
 * hay de cada rol, buscador, filtros por rol y estado, y una tarjeta por
 * cuenta (la tabla del web no cabe en un teléfono), con "Nuevo usuario",
 * "Editar" y "Activar/Desactivar". Tu propia cuenta no se puede desactivar.
 */
export function AdminUsersScreen() {
  const { users, companies, loading, error, refresh } = useAdminUsers();
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filters, setFilters] = useState<UserFilters>(EMPTY_USER_FILTERS);
  const visible = useMemo(() => filterUsers(users, filters), [users, filters]);
  const counts = countUsers(users);
  // Formulario: cerrado (null), nuevo usuario ('new') o editando una cuenta.
  const [editing, setEditing] = useState<AdminUserRow | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const onSaved = (message: string) => {
    setEditing(null);
    setToast(message);
    void refresh();
  };

  // Como el web: desactivar es DELETE (borrado lógico) y activar es PATCH.
  const toggleActive = async (user: AdminUserRow) => {
    setBusyId(user.id);
    setActionError(null);
    try {
      if (user.isActive) await deactivateUser(user.id);
      else await updateUser(user.id, { isActive: true });
      setToast(`Usuario ${user.name} ${user.isActive ? 'desactivado' : 'activado'}`);
      void refresh();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status < 500 ? e.message : 'No se pudo cambiar el estado del usuario.');
    } finally {
      setBusyId(null);
    }
  };

  // Desactivar se confirma; activar no (no hay nada que deshacer).
  const requestToggle = (user: AdminUserRow) => {
    if (!user.isActive) {
      void toggleActive(user);
      return;
    }
    confirmAction({
      title: 'Desactivar usuario',
      message: `¿Desactivar a ${user.name}? No podrá iniciar sesión, pero su cuenta seguirá registrada y se podrá volver a activar.`,
      confirmText: 'Desactivar',
      destructive: true,
      onConfirm: () => void toggleActive(user),
    });
  };

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
        {toast ? (
          <LinearGradient colors={['#1f9d4f', '#167a3c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toast}>
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={styles.toastText} accessibilityRole="alert">
              {toast}
            </Text>
          </LinearGradient>
        ) : null}

        <Text style={styles.title} accessibilityRole="header">Gestión de Usuarios</Text>
        <Text style={styles.subtitle}>{users.length} usuarios registrados en el sistema</Text>
        <Pressable
          onPress={() => setEditing('new')}
          accessibilityRole="button"
          accessibilityLabel="Nuevo usuario"
          style={({ pressed }) => [styles.newWrap, pressed && styles.dimmed]}
        >
          <LinearGradient colors={['#1d6fe0', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newButton}>
            <Text style={styles.newText}>➕ Nuevo usuario</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.chips}>
          {chips.map((chip) => (
            <Badge key={chip.label} label={chip.label} color={chip.color} />
          ))}
        </View>

        {error || actionError ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error ?? actionError}</Text>
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
              <UserCard
                key={user.id}
                user={user}
                isMe={user.id === me?.id}
                busy={busyId === user.id}
                onEdit={() => setEditing(user)}
                onToggle={() => requestToggle(user)}
              />
            ))}
            <Text style={styles.footer}>
              Mostrando {visible.length} de {users.length} usuarios
            </Text>
          </>
        )}
      </ScrollView>
      <UserForm user={editing} users={users} companies={companies} myId={me?.id ?? null} onClose={() => setEditing(null)} onSaved={onSaved} />
    </SafeAreaView>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const styles = useStyles();
  return <Text style={[styles.badge, { color, backgroundColor: `${color}18`, borderColor: `${color}33` }]}>{label}</Text>;
}

function UserCard({
  user,
  isMe,
  busy,
  onEdit,
  onToggle,
}: {
  user: AdminUserRow;
  isMe: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const role = USER_ROLE[user.role];
  return (
    <View style={[styles.card, !user.isActive && styles.cardInactive]}>
      <View
        style={styles.info}
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
      <View style={styles.actions}>
        <Pressable
          onPress={onEdit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${user.name}`}
          style={({ pressed }) => [styles.action, styles.editAction, (pressed || busy) && styles.dimmed]}
        >
          <Text style={styles.editText}>✏️ Editar</Text>
        </Pressable>
        {isMe ? null : (
          <Pressable
            onPress={onToggle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`${user.isActive ? 'Desactivar' : 'Activar'} ${user.name}`}
            accessibilityState={{ disabled: busy, busy }}
            style={({ pressed }) => [styles.action, user.isActive ? styles.offAction : styles.onAction, (pressed || busy) && styles.dimmed]}
          >
            <Text style={[styles.toggleText, { color: user.isActive ? RED : GREEN }]}>
              {busy ? 'Guardando...' : user.isActive ? '🚫 Desactivar' : '✅ Activar'}
            </Text>
          </Pressable>
        )}
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
  newWrap: { alignSelf: 'flex-start', marginTop: spacing.md },
  newButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md },
  newText: { color: '#ffffff', fontSize: font(14), fontWeight: '700' },
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
  info: { gap: 12 },
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  toastText: { flex: 1, color: '#ffffff', fontSize: font(14), fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  editAction: { borderColor: colors.border, backgroundColor: colors.field },
  editText: { color: colors.muted, fontSize: font(12) },
  offAction: { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  onAction: { borderColor: 'rgba(34, 197, 94, 0.3)', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
  toggleText: { fontSize: font(12) },
  dimmed: { opacity: 0.7 },
  footer: { marginTop: spacing.xs, textAlign: 'center', color: colors.placeholder, fontSize: font(12) },
}));
