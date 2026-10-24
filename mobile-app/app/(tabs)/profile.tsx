// ============================================================
// Tab 5 — Perfil del Conductor / Empresa
// Driver profile, license info, shift schedule, settings,
// and app information
// ============================================================
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { spacing, radius, fontSize } from '@/constants/Layout';
import { DRIVER_PROFILE } from '@/data/mockData';

const theme = Colors.dark;

export default function ProfileScreen() {
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Profile Card ────────────────────────────────── */}
      <View style={styles.profileCard}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {DRIVER_PROFILE.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </Text>
          </View>
          <View style={styles.onlineIndicator} />
        </View>

        <Text style={styles.profileName}>{DRIVER_PROFILE.name}</Text>
        <Text style={styles.profileEmail}>{DRIVER_PROFILE.email}</Text>

        {/* Role badge */}
        <View style={styles.roleBadge}>
          <Ionicons name="shield-checkmark" size={14} color={theme.primary300} />
          <Text style={styles.roleBadgeText}>{DRIVER_PROFILE.role}</Text>
        </View>
      </View>

      {/* ─── Stats Summary ───────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{DRIVER_PROFILE.tripsTotal}</Text>
          <Text style={styles.statLabel}>Viajes</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: theme.warning }]}>{DRIVER_PROFILE.rating}</Text>
          <Text style={styles.statLabel}>Puntuación</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: theme.success }]}>{DRIVER_PROFILE.tripsToday}</Text>
          <Text style={styles.statLabel}>Hoy</Text>
        </View>
      </View>

      {/* ─── Company & License ───────────────────────────── */}
      <Text style={styles.sectionTitle}>Información</Text>
      <View style={styles.infoCard}>
        <InfoRow icon="business" label="Empresa" value={DRIVER_PROFILE.company} />
        <InfoRow icon="id-card" label="ID Empresa" value={DRIVER_PROFILE.companyId} />
        <InfoRow icon="document-text" label="Licencia vence" value={DRIVER_PROFILE.licenseExpiry} />
        <InfoRow icon="time" label="Turno actual" value={DRIVER_PROFILE.shift} last />
      </View>

      {/* ─── Settings ────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Configuración</Text>
      <View style={styles.infoCard}>
        <SettingToggle
          icon="location"
          label="GPS activo"
          subtitle="Transmitir ubicación en recorrido"
          value={gpsEnabled}
          onToggle={setGpsEnabled}
          color={theme.success}
        />
        <SettingToggle
          icon="notifications"
          label="Notificaciones"
          subtitle="Alertas de tráfico y desvíos"
          value={notificationsEnabled}
          onToggle={setNotificationsEnabled}
          color={theme.info}
        />
        <SettingToggle
          icon="moon"
          label="Modo oscuro"
          subtitle="Tema de la interfaz"
          value={darkMode}
          onToggle={setDarkMode}
          color={theme.primary300}
          last
        />
      </View>

      {/* ─── Actions ─────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Cuenta</Text>
      <View style={styles.infoCard}>
        <ActionRow icon="help-circle" label="Ayuda y soporte" color={theme.info} />
        <ActionRow icon="document" label="Términos y condiciones" color={theme.textSecondary} />
        <ActionRow icon="shield" label="Política de privacidad" color={theme.textSecondary} />
        <ActionRow
          icon="log-out"
          label="Cerrar sesión"
          color={theme.danger}
          last
          onPress={() => Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Cerrar sesión', style: 'destructive' },
          ])}
        />
      </View>

      {/* ─── App Info ────────────────────────────────────── */}
      <View style={styles.appInfo}>
        <Text style={styles.appInfoText}>TransitHub Mobile v1.0.0</Text>
        <Text style={styles.appInfoText}>© 2026 TransitHub — Temuco, Chile</Text>
      </View>

      <View style={{ height: spacing['4xl'] }} />
    </ScrollView>
  );
}

// ── InfoRow ─────────────────────────────────────────────────
function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon as any} size={18} color={theme.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ── SettingToggle ───────────────────────────────────────────
function SettingToggle({
  icon,
  label,
  subtitle,
  value,
  onToggle,
  color,
  last = false,
}: {
  icon: string;
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, !last && styles.infoRowBorder]}>
      <View style={[styles.settingIconWrap, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.surface3, true: color + '50' }}
        thumbColor={value ? color : theme.textMuted}
      />
    </View>
  );
}

// ── ActionRow ───────────────────────────────────────────────
function ActionRow({
  icon,
  label,
  color,
  last = false,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        !last && styles.infoRowBorder,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgDeep },
  content: { padding: spacing.lg },

  // Profile card
  profileCard: {
    alignItems: 'center',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius['2xl'],
    padding: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  avatarSection: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.primary500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.primary300 + '30',
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.success,
    borderWidth: 3,
    borderColor: theme.surface1,
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.md,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(90, 150, 245, 0.10)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: theme.primary300,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: theme.primary300,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.border,
  },

  // Section title
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },

  // Info card
  infoCard: {
    backgroundColor: theme.surface1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  infoLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },

  // Setting row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  settingSubtitle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 1,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  actionLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // App info
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    gap: 4,
  },
  appInfoText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
});
