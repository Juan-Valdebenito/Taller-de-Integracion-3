import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { fetchAllStops, fetchRouteAlternatives, fetchTransitRouteLabels, type RoutePlan } from '../../api/tripPlannerApi';
import type { Stop } from '../../location/geo';
import { Button } from '../Button';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

type Selection = 'origin' | 'destination' | null;

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h ${remainder} min` : `${minutes} min`;
}

function walkingMinutes(plan: RoutePlan): number {
  const seconds = plan.movements.reduce((total, movement) => total + (movement.mode === 'walk' ? movement.time_seconds : 0), 0);
  return Math.ceil(seconds / 60);
}

function RouteOption({ plan, index, routeLabels }: { plan: RoutePlan; index: number; routeLabels: Record<string, string> }) {
  const styles = useStyles();
  const walking = walkingMinutes(plan);
  const lines = [...new Set(plan.movements.filter((movement) => movement.mode === 'bus' && movement.route_id).map((movement) => routeLabels[movement.route_id!] ?? movement.route_id!))];
  return (
    <View style={[styles.option, index === 0 ? styles.recommended : null]}>
      <View style={styles.optionHeader}>
        <Text style={styles.optionTitle}>{index === 0 ? 'Recomendación principal' : `Alternativa ${index}`}</Text>
        <Text style={styles.duration}>{formatDuration(plan.total_time_seconds)}</Text>
      </View>
      <Text style={styles.optionDetails}>
        {plan.transfers === 0 ? 'Sin transbordos' : `${plan.transfers} ${plan.transfers === 1 ? 'transbordo' : 'transbordos'}`}
        {walking ? ` · ${walking} min a pie` : ''}
      </Text>
      {lines.length ? <Text style={styles.optionDetails}>Líneas: {lines.join(', ')}</Text> : null}
      <Text style={styles.optionDetails}>{(plan.total_distance_meters / 1000).toFixed(1).replace('.', ',')} km en total</Text>
    </View>
  );
}

export function TripPlanner() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeLabels, setRouteLabels] = useState<Record<string, string>>({});
  const [loadingStops, setLoadingStops] = useState(true);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Stop | null>(null);
  const [destination, setDestination] = useState<Stop | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState('');
  const [plans, setPlans] = useState<RoutePlan[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchAllStops(), fetchTransitRouteLabels().catch(() => ({}))])
      .then(([result, labels]) => {
        if (mounted) {
          setStops(result.sort((left, right) => left.name.localeCompare(right.name, 'es')));
          setRouteLabels(labels);
        }
      })
      .catch((error: unknown) => {
        if (mounted) setStopsError(error instanceof Error ? error.message : 'No se pudieron cargar los paraderos.');
      })
      .finally(() => {
        if (mounted) setLoadingStops(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredStops = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return stops.filter((stop) => {
      if (selection === 'origin' && stop.id === destination?.id) return false;
      if (selection === 'destination' && stop.id === origin?.id) return false;
      return !normalized || stop.name.toLocaleLowerCase('es').includes(normalized);
    }).slice(0, 8);
  }, [destination?.id, origin?.id, query, selection, stops]);

  const chooseStop = (stop: Stop) => {
    if (selection === 'origin') setOrigin(stop);
    if (selection === 'destination') setDestination(stop);
    setPlans(null);
    setPlanError(null);
    setSelection(null);
    setQuery('');
  };

  const planTrip = async () => {
    if (!origin || !destination) return;
    setPlanning(true);
    setPlanError(null);
    setPlans(null);
    try {
      const result = await fetchRouteAlternatives(origin, destination);
      setPlans(result);
      if (result.length === 0) setPlanError('No encontramos un recorrido entre esos paraderos.');
    } catch (error: unknown) {
      setPlanError(error instanceof Error ? error.message : 'No se pudieron calcular los recorridos. Intenta de nuevo.');
    } finally {
      setPlanning(false);
    }
  };

  const selectionTitle = selection === 'origin' ? 'origen' : 'destino';

  return (
    <View>
      <Text style={styles.intro}>Elige dos paraderos y compara las opciones por tiempo total.</Text>
      {loadingStops ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.helper}>Cargando paraderos…</Text></View>
      ) : stopsError ? (
        <Text style={styles.error} accessibilityRole="alert">{stopsError}</Text>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => { setSelection('origin'); setQuery(''); }} style={styles.stopField}>
            <Text style={styles.fieldLabel}>Origen</Text>
            <Text style={[styles.stopName, !origin ? styles.placeholder : null]}>{origin?.name ?? 'Selecciona un paradero'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setSelection('destination'); setQuery(''); }} style={styles.stopField}>
            <Text style={styles.fieldLabel}>Destino</Text>
            <Text style={[styles.stopName, !destination ? styles.placeholder : null]}>{destination?.name ?? 'Selecciona un paradero'}</Text>
          </Pressable>

          {selection ? (
            <View style={styles.picker}>
              <Text style={styles.fieldLabel}>Buscar paradero de {selectionTitle}</Text>
              <TextInput
                accessibilityLabel={`Buscar paradero de ${selectionTitle}`}
                autoCapitalize="none"
                onChangeText={setQuery}
                placeholder="Escribe el nombre"
                placeholderTextColor={colors.placeholder}
                style={styles.searchInput}
                value={query}
              />
              {filteredStops.map((stop) => (
                <Pressable key={stop.id} accessibilityRole="button" onPress={() => chooseStop(stop)} style={styles.stopResult}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                </Pressable>
              ))}
              {filteredStops.length === 0 ? <Text style={styles.helper}>No hay paraderos que coincidan.</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => setSelection(null)} style={styles.cancelPicker}>
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.action}>
            <Button title="Buscar recorridos" onPress={planTrip} disabled={!origin || !destination || origin.id === destination.id} loading={planning} loadingTitle="Calculando…" />
          </View>
          {planError ? <Text style={styles.error} accessibilityRole="alert">{planError}</Text> : null}
          {plans?.length ? (
            <View style={styles.results}>
              <Text style={styles.resultsTitle}>Opciones ordenadas por tiempo</Text>
              {plans.slice(0, 3).map((plan, index) => <RouteOption key={`${plan.origin_stop_id}-${plan.destination_stop_id}-${index}`} plan={plan} index={index} routeLabels={routeLabels} />)}
              {plans.length < 3 ? <Text style={styles.helper}>El planificador encontró {plans.length} recorrido{plans.length === 1 ? '' : 's'} distinto{plans.length === 1 ? '' : 's'}.</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  intro: { color: colors.muted, fontSize: font(13), lineHeight: font(19) },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  helper: { color: colors.muted, fontSize: font(12), lineHeight: font(18), marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: font(13), lineHeight: font(19), marginTop: spacing.sm },
  stopField: { backgroundColor: colors.field, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  fieldLabel: { color: colors.muted, fontSize: font(11), fontWeight: '600', marginBottom: 2 },
  stopName: { color: colors.text, fontSize: font(14), lineHeight: font(20) },
  placeholder: { color: colors.placeholder },
  picker: { marginTop: spacing.md, padding: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { backgroundColor: colors.field, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontSize: font(14), marginBottom: spacing.xs },
  stopResult: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancelPicker: { alignSelf: 'flex-end', paddingTop: spacing.sm },
  link: { color: colors.accent, fontSize: font(13), fontWeight: '600' },
  action: { marginTop: spacing.md },
  results: { marginTop: spacing.md, gap: spacing.sm },
  resultsTitle: { color: colors.text, fontSize: font(14), fontWeight: '700' },
  option: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm },
  recommended: { borderColor: colors.accent, borderLeftWidth: 4 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  optionTitle: { color: colors.text, fontSize: font(13), fontWeight: '700', flexShrink: 1 },
  duration: { color: colors.accent, fontSize: font(15), fontWeight: '700' },
  optionDetails: { color: colors.muted, fontSize: font(12), marginTop: 3 },
}));
