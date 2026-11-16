import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { fetchAllStops, fetchRouteAlternatives, fetchTransitRouteLabels, type RoutePlan } from '../api/tripPlannerApi';
import type { Stop } from '../location/geo';
import { findNearestStop } from '../location/geo';
import { useLocation } from '../hooks/useLocation';
import { Button } from '../components/Button';
import { makeStyles, radius, spacing, useTheme } from '../theme';

type University = { id: string; university: string; campus: string; latitude: number; longitude: number };

// Campus principales de educación universitaria dentro de Temuco.
const UNIVERSITIES: University[] = [
  { id: 'ufro-andres-bello', university: 'Universidad de La Frontera', campus: 'Campus Andrés Bello', latitude: -38.7481, longitude: -72.6162 },
  { id: 'ufro-salud', university: 'Universidad de La Frontera', campus: 'Campus de la Salud (Facultad de Medicina)', latitude: -38.73779, longitude: -72.59926 },
  { id: 'uct-san-francisco', university: 'Universidad Católica de Temuco', campus: 'Campus San Francisco', latitude: -38.7374, longitude: -72.6184 },
  { id: 'uct-san-juan-pablo-ii', university: 'Universidad Católica de Temuco', campus: 'Campus San Juan Pablo II (ex Campus Norte)', latitude: -38.70206, longitude: -72.54728 },
  { id: 'autonoma', university: 'Universidad Autónoma de Chile', campus: 'Sede Temuco', latitude: -38.7333, longitude: -72.6064 },
  { id: 'mayor', university: 'Universidad Mayor', campus: 'Campus Alemania', latitude: -38.7330, longitude: -72.6030 },
  { id: 'santotomas', university: 'Universidad Santo Tomás', campus: 'Sede Temuco', latitude: -38.7343, longitude: -72.6060 },
];

const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};

function UniversityOption({ plan, index, labels }: { plan: RoutePlan; index: number; labels: Record<string, string> }) {
  const styles = useStyles();
  const lines = [...new Set(plan.movements.filter((movement) => movement.mode === 'bus').map((movement) => labels[movement.route_id ?? ''] ?? movement.route_id).filter(Boolean))];
  const walk = plan.movements.filter((movement) => movement.mode === 'walk').reduce((sum, movement) => sum + movement.time_seconds, 0);
  return (
    <View accessibilityLabel={`${index === 0 ? 'Opción recomendada' : `Opción ${index + 1}`}, ${formatDuration(plan.total_time_seconds)}`} style={[styles.routeCard, index === 0 ? styles.bestRoute : null]}>
      <View style={styles.routeHeader}>
        <View style={styles.routeTitleRow}><View style={[styles.routeMarker, index === 0 ? styles.routeMarkerActive : null]} /><Text style={styles.routeHeading}>{index === 0 ? 'Más rápida' : `Alternativa ${index}`}</Text></View>
        <Text style={styles.routeTime}>{formatDuration(plan.total_time_seconds)}</Text>
      </View>
      <View style={styles.routeDivider} />
      <View style={styles.routeFacts}>
        <View style={styles.routeFact}><Text style={styles.factIcon}>🚌</Text><Text style={styles.routeMeta}>{lines.length ? lines.join(' · ') : 'A pie'}</Text></View>
        <View style={styles.routeFact}><Text style={styles.factIcon}>🚶</Text><Text style={styles.routeMeta}>{walk ? `${formatDuration(walk)} caminando` : 'Sin caminata'}</Text></View>
        <View style={styles.routeFact}><Text style={styles.factIcon}>↔</Text><Text style={styles.routeMeta}>{plan.transfers ? `${plan.transfers} transbordo${plan.transfers > 1 ? 's' : ''}` : 'Directa'}</Text></View>
      </View>
      <Text style={styles.distance}>{(plan.total_distance_meters / 1000).toFixed(1).replace('.', ',')} km de recorrido</Text>
    </View>
  );
}

export function UniversityScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<University | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<RoutePlan[] | null>(null);
  const [loadingStops, setLoadingStops] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopsError, setStopsError] = useState<string | null>(null);

  const loadStops = async () => {
    setLoadingStops(true);
    setStopsError(null);
    Promise.all([fetchAllStops(), fetchTransitRouteLabels().catch(() => ({}))])
      .then(([allStops, routeLabels]) => { setStops(allStops); setLabels(routeLabels); })
      .catch(() => { setStopsError('No pudimos cargar los paraderos. Revisa tu conexión e inténtalo otra vez.'); })
      .finally(() => setLoadingStops(false));
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchAllStops(), fetchTransitRouteLabels().catch(() => ({}))])
      .then(([allStops, routeLabels]) => { if (active) { setStops(allStops); setLabels(routeLabels); } })
      .catch(() => { if (active) setStopsError('No pudimos cargar los paraderos. Revisa tu conexión e inténtalo otra vez.'); })
      .finally(() => { if (active) setLoadingStops(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return UNIVERSITIES.filter((university) => `${university.university} ${university.campus}`.toLocaleLowerCase('es').includes(normalized));
  }, [query]);

  const choose = async (university: University) => {
    setSelected(university);
    setPlans(null);
    setError(null);
    if (!location.position) {
      return;
    }
    if (!stops.length) {
      setError('Todavía no hay paraderos disponibles para calcular el recorrido.');
      return;
    }
    const origin = findNearestStop(location.position, stops)?.stop;
    const destination = findNearestStop(university, stops)?.stop;
    if (!origin || !destination) { setError('No encontramos paraderos cerca de tu ubicación o del campus.'); return; }
    setPlanning(true);
    try {
      const alternatives = await fetchRouteAlternatives(origin, destination);
      setPlans(alternatives);
      if (!alternatives.length) setError('No encontramos una ruta entre estos paraderos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular el viaje. Intenta de nuevo.');
    } finally { setPlanning(false); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Text style={styles.cap}>🎓</Text></View>
        <Text style={styles.eyebrow}>TRANSPORTE UNIVERSITARIO · TEMUCO</Text>
        <Text style={styles.title}>Cómo llegar a tu universidad</Text>
        <Text style={styles.subtitle}>Compara micros, caminatas y tiempos desde tu ubicación en Temuco.</Text>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon} accessibilityElementsHidden>⌕</Text>
        <TextInput accessibilityLabel="Buscar universidad o campus" accessibilityHint="Filtra la lista por nombre de universidad o campus" autoCapitalize="none" returnKeyType="search" onChangeText={setQuery} placeholder="Universidad o campus" placeholderTextColor={colors.muted} style={styles.search} value={query} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => setQuery('')} hitSlop={8} style={styles.clearSearch}><Text style={styles.clearText}>×</Text></Pressable> : null}
      </View>
      <View style={styles.listHeading}><Text style={styles.sectionTitle}>{query ? 'Resultados' : 'Universidades de Temuco'}</Text><Text style={styles.count}>{filtered.length}</Text></View>

      {loadingStops ? <View accessibilityRole="progressbar" accessibilityLabel="Cargando paraderos" style={styles.loadingCard}><ActivityIndicator color={colors.accent} /><View><Text style={styles.loadingTitle}>Preparando recorridos</Text><Text style={styles.helper}>Cargando paraderos cercanos a los campus…</Text></View></View> : null}
      {stopsError ? <View style={styles.stateCard}><Text style={styles.stateIcon}>!</Text><View style={styles.stateCopy}><Text style={styles.stateTitle}>No se pudieron cargar las rutas</Text><Text accessibilityRole="alert" style={styles.helper}>{stopsError}</Text><Pressable accessibilityRole="button" onPress={() => { void loadStops(); }} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable></View></View> : null}
      {filtered.map((university) => (
        <Pressable key={university.id} accessibilityRole="button" accessibilityLabel={`${university.university}, ${university.campus}`} accessibilityHint="Calcula opciones de viaje a este campus" accessibilityState={{ selected: selected?.id === university.id, disabled: loadingStops || Boolean(stopsError) }} disabled={loadingStops || Boolean(stopsError)} onPress={() => choose(university)} style={({ pressed }) => [styles.university, selected?.id === university.id ? styles.selectedUniversity : null, pressed ? styles.universityPressed : null, loadingStops || stopsError ? styles.disabledCard : null]}>
          <View style={styles.universityIcon}><Text style={styles.cap}>🎓</Text></View>
          <View style={styles.universityInfo}><Text style={styles.campus}>{university.university}</Text><Text style={styles.universityName}>{university.campus}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
      {!filtered.length ? <View style={styles.emptyCard}><Text style={styles.emptyIcon}>⌕</Text><Text style={styles.stateTitle}>No encontramos ese campus</Text><Text style={styles.helper}>Revisa el nombre o prueba con la universidad.</Text><Pressable accessibilityRole="button" onPress={() => setQuery('')} style={styles.retry}><Text style={styles.retryText}>Ver todos los campus</Text></Pressable></View> : null}

      {selected ? <View style={styles.results}>
        <Text style={styles.sectionTitle}>Tu viaje a {selected.campus}</Text>
        {location.position ? <View style={styles.originPill}><View style={styles.originDot} /><Text style={styles.originText}>Desde tu ubicación actual</Text></View> : <View style={styles.stateCard}>
          <Text style={styles.stateIcon}>⌖</Text><View style={styles.stateCopy}><Text style={styles.stateTitle}>Activa tu ubicación</Text><Text style={styles.helper}>{location.error ?? 'La necesitamos para calcular el viaje desde donde estás.'}</Text><Button title="Usar mi ubicación" onPress={() => { void location.requestAndLocate(); }} loading={location.locating} loadingTitle="Buscando ubicación…" /></View>
        </View>}
        {planning ? <View accessibilityRole="progressbar" accessibilityLabel="Calculando alternativas de viaje" style={styles.loadingCard}><ActivityIndicator color={colors.accent} /><View><Text style={styles.loadingTitle}>Comparando recorridos</Text><Text style={styles.helper}>Revisando micros, caminatas y duración…</Text></View></View> : null}
        {error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorCard}><Text style={styles.errorIcon}>!</Text><Text style={styles.errorText}>{error}</Text></View> : null}
        {plans?.length ? <Text style={styles.helper}>Ordenadas por menor tiempo total</Text> : null}
        {plans?.map((plan, index) => <UniversityOption key={`${plan.origin_stop_id}-${plan.destination_stop_id}-${index}`} plan={plan} index={index} labels={labels} />)}
      </View> : null}
      <Text style={styles.footnote}>Los tiempos son estimados y pueden variar según el tránsito y la espera de la micro.</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors, font) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  hero: { padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  heroIcon: { width: 46, height: 46, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.field, marginBottom: spacing.md },
  eyebrow: { color: colors.accent, fontSize: font(11), fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: font(26), fontWeight: '800', lineHeight: font(32) },
  subtitle: { color: colors.muted, fontSize: font(14), lineHeight: font(21), marginTop: spacing.sm },
  searchWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.field, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  searchIcon: { color: colors.muted, fontSize: font(24) }, search: { flex: 1, color: colors.text, paddingVertical: spacing.md, fontSize: font(15) }, clearSearch: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' }, clearText: { color: colors.muted, fontSize: font(24) },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }, sectionTitle: { color: colors.text, fontSize: font(18), fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs }, count: { color: colors.muted, backgroundColor: colors.field, overflow: 'hidden', borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3, fontSize: font(12), fontWeight: '700' },
  university: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, minHeight: 76 },
  selectedUniversity: { borderColor: colors.accent, borderWidth: 2 }, universityPressed: { backgroundColor: colors.field }, disabledCard: { opacity: 0.62 }, universityIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.field }, cap: { fontSize: font(20) },
  universityInfo: { flex: 1, gap: 4 }, universityName: { fontSize: font(15), fontWeight: '700', color: colors.text }, campus: { fontSize: font(12), color: colors.muted }, chevron: { color: colors.accent, fontSize: font(26), paddingHorizontal: 4 },
  results: { gap: spacing.sm, marginTop: spacing.md }, helper: { color: colors.muted, fontSize: font(13), lineHeight: font(19) },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg }, loadingTitle: { color: colors.text, fontSize: font(14), fontWeight: '700', marginBottom: 3 },
  stateCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg }, stateCopy: { flex: 1, gap: spacing.sm }, stateIcon: { color: colors.warning, fontSize: font(21), fontWeight: '800', width: 30, height: 30, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.warningBg, borderRadius: radius.full, overflow: 'hidden' }, stateTitle: { color: colors.text, fontSize: font(15), fontWeight: '700', textAlign: 'center' }, retry: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' }, retryText: { color: colors.accent, fontWeight: '700', fontSize: font(14) }, emptyCard: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg }, emptyIcon: { color: colors.muted, fontSize: font(28), marginBottom: spacing.xs },
  originPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successBg, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, originDot: { width: 8, height: 8, backgroundColor: colors.accent, borderRadius: radius.full }, originText: { color: colors.text, fontSize: font(12), fontWeight: '600' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, padding: spacing.md }, errorIcon: { color: colors.danger, fontWeight: '800', fontSize: font(16) }, errorText: { color: colors.danger, fontSize: font(13), lineHeight: font(19), flex: 1 },
  routeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }, bestRoute: { borderColor: colors.accent, borderWidth: 2 }, routeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, routeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }, routeMarker: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.muted }, routeMarkerActive: { backgroundColor: colors.accent }, routeHeading: { color: colors.text, fontSize: font(15), fontWeight: '700' }, routeTime: { color: colors.accent, fontSize: font(20), fontWeight: '800' }, routeDivider: { height: 1, backgroundColor: colors.border }, routeFacts: { gap: spacing.sm }, routeFact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 }, factIcon: { width: 24, fontSize: font(14), textAlign: 'center' }, routeMeta: { color: colors.text, fontSize: font(13), lineHeight: font(19) }, distance: { color: colors.muted, fontSize: font(12) },
  footnote: { color: colors.muted, fontSize: font(12), lineHeight: font(18), marginTop: spacing.md },
}));
