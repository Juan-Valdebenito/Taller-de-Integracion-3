import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setCompanyActive, type CompanySummary } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { COMPANY_STATUS_OPTIONS, filterCompanies, type CompanyCard, type CompanyStatusFilter } from '../admin/companies';
import { CompanyForm } from '../components/CompanyForm';
import { SelectField } from '../components/SelectField';
import { useAdminCompanies } from '../hooks/useAdminCompanies';
import { makeStyles, radius, spacing, useTheme } from '../theme';
import { confirmAction } from '../utils/platform';

// Colores del web: hsl(142,71%,45%), hsl(215,80%,55%), hsl(0,84%,60%), hsl(220,10%,50%).
const GREEN = '#22c55e';
const BLUE = '#307de8';
const RED = '#ef4444';
const GREY = '#737d8c';

/**
 * Empresas de transporte del administrador, como AdminCompaniesPage del web:
 * título con cuántas están activas, buscador, filtro de estado y una tarjeta
 * por empresa con su contacto, micros, rutas y reclamos pendientes, y
 * "Nueva empresa", "Editar" y "Activar/Desactivar". El web usa empresas de
 * ejemplo que solo viven en la pantalla; aquí todo se guarda en backend-go.
 */
export function AdminCompaniesScreen() {
  const { companies, loading, error, refresh } = useAdminCompanies();
  const { colors } = useTheme();
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CompanyStatusFilter>('ALL');
  const visible = useMemo(() => filterCompanies(companies, search, status), [companies, search, status]);
  const active = companies.filter((company) => company.isActive).length;
  // Formulario: cerrado (false), nueva empresa (null) o editando una.
  const [editing, setEditing] = useState<CompanySummary | null | false>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const onSaved = (message: string) => {
    setEditing(false);
    setToast(message);
    void refresh();
  };

  const toggleActive = async (company: CompanyCard) => {
    setToggling(company.id);
    setActionError(null);
    try {
      await setCompanyActive(company.id, !company.isActive);
      setToast(`Empresa ${company.name} ${company.isActive ? 'desactivada' : 'activada'}`);
      void refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado de la empresa.');
    } finally {
      setToggling(null);
    }
  };

  // Desactivar se confirma; activar no (no hay nada que deshacer).
  const requestToggle = (company: CompanyCard) => {
    if (!company.isActive) {
      void toggleActive(company);
      return;
    }
    confirmAction({
      title: 'Desactivar empresa',
      message: `¿Desactivar ${company.name}? Seguirá registrada y se podrá volver a activar.`,
      confirmText: 'Desactivar',
      destructive: true,
      onConfirm: () => void toggleActive(company),
    });
  };

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

        <Text style={styles.title} accessibilityRole="header">Empresas de Transporte</Text>
        <Text style={styles.subtitle}>
          {active} activas de {companies.length} registradas
        </Text>
        <Pressable
          onPress={() => setEditing(null)}
          accessibilityRole="button"
          accessibilityLabel="Nueva empresa"
          style={({ pressed }) => [styles.newWrap, pressed && styles.dimmed]}
        >
          <LinearGradient colors={['#1d6fe0', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newButton}>
            <Text style={styles.newText}>➕ Nueva empresa</Text>
          </LinearGradient>
        </Pressable>

        {error || actionError ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error ?? actionError}</Text>
          </View>
        ) : null}

        <View style={styles.search}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre, RUT o email..."
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Buscar empresa"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        <SelectField label="Estado" value={status} options={COMPANY_STATUS_OPTIONS} onChange={setStatus} />

        {loading && companies.length === 0 ? (
          <Text style={styles.empty}>Cargando empresas...</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{error ? '' : 'No se encontraron empresas'}</Text>
        ) : (
          visible.map((company) => (
            <CompanyCardView
              key={company.id}
              company={company}
              busy={toggling === company.id}
              onEdit={() => setEditing(company)}
              onToggle={() => requestToggle(company)}
            />
          ))
        )}
      </ScrollView>
      <CompanyForm visible={editing !== false} company={editing || null} onClose={() => setEditing(false)} onSaved={onSaved} />
    </SafeAreaView>
  );
}

function CompanyCardView({ company, busy, onEdit, onToggle }: { company: CompanyCard; busy: boolean; onEdit: () => void; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const badgeColor = company.isActive ? GREEN : GREY;
  const stats = [
    { label: 'Micros', value: company.buses, color: BLUE },
    { label: 'Rutas', value: company.routes, color: GREEN },
    { label: 'Reclamos', value: company.pendingComplaints, color: company.pendingComplaints > 0 ? RED : colors.placeholder },
  ];
  return (
    <View style={[styles.card, !company.isActive && styles.cardInactive]}>
      <View
        style={styles.cardHeader}
        accessible
        accessibilityLabel={`${company.name}, ${company.isActive ? 'activa' : 'inactiva'}: ${company.buses} micros, ${company.routes} rutas, ${company.pendingComplaints} reclamos pendientes`}
      >
        <View style={styles.cardTitle}>
          <LinearGradient colors={['#1d6fe0', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
            <Text style={styles.logoEmoji}>🏢</Text>
          </LinearGradient>
          <View style={styles.cardTitleText}>
            <Text style={styles.name}>{company.name}</Text>
            <Text style={styles.id}>{company.rut || company.id}</Text>
          </View>
        </View>
        <Text style={[styles.badge, { color: badgeColor, backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}33` }]}>
          {company.isActive ? 'Activa' : 'Inactiva'}
        </Text>
      </View>

      <View style={styles.contact}>
        {[
          { icon: '📧', value: company.email },
          { icon: '📞', value: company.phone },
          { icon: '📍', value: company.address },
        ]
          .filter((row): row is { icon: string; value: string } => !!row.value)
          .map(({ icon, value }) => (
            <Text key={icon} style={styles.contactRow}>
              {icon} {value}
            </Text>
          ))}
      </View>

      <View style={styles.stats}>
        {stats.map(({ label, value, color }) => (
          <View key={label} style={styles.stat}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {company.buses > 0 ? (
        <Text style={styles.detail}>
          {company.activeBuses} de {company.buses} micros en servicio ahora
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${company.name}`}
          style={({ pressed }) => [styles.action, styles.editAction, pressed && styles.dimmed]}
        >
          <Text style={styles.editText}>✏️ Editar</Text>
        </Pressable>
        <Pressable
          onPress={onToggle}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${company.isActive ? 'Desactivar' : 'Activar'} ${company.name}`}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.action, company.isActive ? styles.offAction : styles.onAction, (pressed || busy) && styles.dimmed]}
        >
          <Text style={[styles.toggleText, { color: company.isActive ? RED : GREEN }]}>
            {busy ? 'Guardando...' : company.isActive ? '🚫 Desactivar' : '✅ Activar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Medidas de AdminCompaniesPage del web (tarjetas --radius-lg con --space-6).
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.xs, color: colors.muted, fontSize: font(14) },
  newWrap: { alignSelf: 'flex-start', marginTop: spacing.md, marginBottom: spacing.lg },
  newButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md },
  newText: { color: '#ffffff', fontSize: font(14), fontWeight: '700' },
  dimmed: { opacity: 0.7 },
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
  contact: { gap: spacing.xs },
  contactRow: { color: colors.placeholder, fontSize: font(12), lineHeight: font(18) },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  editAction: { borderColor: colors.border, backgroundColor: colors.field },
  editText: { color: colors.muted, fontSize: font(12) },
  offAction: { borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  onAction: { borderColor: 'rgba(34, 197, 94, 0.3)', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
  toggleText: { fontSize: font(12) },
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
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 20 },
  cardTitleText: { flex: 1 },
  name: { color: colors.text, fontSize: font(16), fontWeight: '700' },
  id: { marginTop: 2, color: colors.placeholder, fontSize: font(11), fontFamily: 'monospace' },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    fontSize: font(11),
    fontWeight: '600',
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', padding: 12, borderRadius: radius.md, backgroundColor: colors.field },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: font(18), fontWeight: '800' },
  statLabel: { color: colors.placeholder, fontSize: font(10), letterSpacing: 0.5, textTransform: 'uppercase' },
  detail: { color: colors.muted, fontSize: font(12) },
}));
