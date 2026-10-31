import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COMPANY_STATUS_OPTIONS, filterCompanies, type CompanyCard, type CompanyStatusFilter } from '../admin/companies';
import { SelectField } from '../components/SelectField';
import { useAdminCompanies } from '../hooks/useAdminCompanies';
import { makeStyles, radius, spacing, useTheme } from '../theme';

// Colores del web: hsl(142,71%,45%), hsl(215,80%,55%), hsl(0,84%,60%), hsl(220,10%,50%).
const GREEN = '#22c55e';
const BLUE = '#307de8';
const RED = '#ef4444';
const GREY = '#737d8c';

/**
 * Empresas de transporte del administrador, como AdminCompaniesPage del web:
 * título con cuántas están activas, buscador, filtro de estado y una tarjeta
 * por empresa con sus micros, rutas y reclamos pendientes. El web usa
 * empresas de ejemplo; aquí son las de backend-go, que por ahora solo entrega
 * nombre y estado de las activas (sin RUT ni contacto).
 */
export function AdminCompaniesScreen() {
  const { companies, loading, error, refresh } = useAdminCompanies();
  const { colors } = useTheme();
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CompanyStatusFilter>('ALL');
  const visible = useMemo(() => filterCompanies(companies, search, status), [companies, search, status]);
  const active = companies.filter((company) => company.isActive).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.primary]} />}
      >
        <Text style={styles.title} accessibilityRole="header">Empresas de Transporte</Text>
        <Text style={styles.subtitle}>
          {active} activas de {companies.length} registradas
        </Text>

        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.search}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre..."
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
          visible.map((company) => <CompanyCardView key={company.id} company={company} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CompanyCardView({ company }: { company: CompanyCard }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const badgeColor = company.isActive ? GREEN : GREY;
  const stats = [
    { label: 'Micros', value: company.buses, color: BLUE },
    { label: 'Rutas', value: company.routes, color: GREEN },
    { label: 'Reclamos', value: company.pendingComplaints, color: company.pendingComplaints > 0 ? RED : colors.placeholder },
  ];
  return (
    <View
      style={[styles.card, !company.isActive && styles.cardInactive]}
      accessible
      accessibilityLabel={`${company.name}, ${company.isActive ? 'activa' : 'inactiva'}: ${company.buses} micros, ${company.routes} rutas, ${company.pendingComplaints} reclamos pendientes`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <LinearGradient colors={['#1d6fe0', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
            <Text style={styles.logoEmoji}>🏢</Text>
          </LinearGradient>
          <View style={styles.cardTitleText}>
            <Text style={styles.name}>{company.name}</Text>
            <Text style={styles.id}>{company.id}</Text>
          </View>
        </View>
        <Text style={[styles.badge, { color: badgeColor, backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}33` }]}>
          {company.isActive ? 'Activa' : 'Inactiva'}
        </Text>
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
    </View>
  );
}

// Medidas de AdminCompaniesPage del web (tarjetas --radius-lg con --space-6).
const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: font(28), lineHeight: font(34), fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg, color: colors.muted, fontSize: font(14) },
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
