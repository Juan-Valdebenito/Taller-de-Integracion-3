import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import { fetchAllStops, fetchRouteAlternatives, fetchTransitRouteLabels, type RoutePlan } from '../../api/tripPlannerApi';
import type { Stop } from '../../location/geo';
import type { LiveBus } from '../../realtime/liveBuses';
import { Button } from '../Button';
import { ErrorState } from '../ErrorState';
import { LoadingState } from '../LoadingState';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

type Selection = 'origin' | 'destination' | null;
type Preference = 'fastest' | 'least_walking' | 'least_occupied';

const PREFERENCE_OPTIONS: readonly { id: Preference; label: string; description: string }[] = [
  { id: 'fastest', label: 'Llegar antes', description: 'Prioriza el menor tiempo total.' },
  { id: 'least_walking', label: 'Caminar menos', description: 'Reduce el tiempo de los tramos a pie.' },
  { id: 'least_occupied', label: 'Menor ocupación', description: 'Usa la ocupación reciente de micros activas.' },
];

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h ${remainder} min` : `${minutes} min`;
}

function walkingSeconds(plan: RoutePlan): number {
  return plan.movements.reduce((total, movement) => total + (movement.mode === 'walk' ? movement.time_seconds : 0), 0);
}

function busSeconds(plan: RoutePlan): number {
  return plan.movements.reduce((total, movement) => total + (movement.mode === 'bus' ? movement.time_seconds : 0), 0);
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function formatSegmentDuration(seconds: number): string {
  return seconds <= 0 ? '0 min' : formatDuration(seconds);
}

type TimelineStep = {
  kind: 'walk' | 'bus' | 'transfer' | 'wait';
  title: string;
  detail: string;
  seconds?: number;
};

function stopName(stops: readonly Stop[], id: string): string {
  return stops.find((stop) => stop.id === id)?.name ?? 'Paradero';
}

function routeName(routeId: string | undefined, routeLabels: Record<string, string>): string {
  return routeId ? routeLabels[routeId] ?? routeId : 'micro';
}

function buildTimeline(plan: RoutePlan, stops: readonly Stop[], routeLabels: Record<string, string>): TimelineStep[] {
  const steps: TimelineStep[] = [];
  let previousBusRoute: string | undefined;
  let transferAdded = false;

  plan.movements.forEach((movement, index) => {
    if (movement.mode === 'walk') {
      const nextBus = plan.movements.slice(index + 1).find((candidate) => candidate.mode === 'bus');
      if (previousBusRoute && !transferAdded && nextBus?.route_id && nextBus.route_id !== previousBusRoute) {
        steps.push({
          kind: 'transfer',
          title: 'Transbordo',
          detail: `De ${routeName(previousBusRoute, routeLabels)} a ${routeName(nextBus.route_id, routeLabels)}`,
        });
        transferAdded = true;
      }
      steps.push({
        kind: 'walk',
        title: 'Caminata',
        detail: `${stopName(stops, movement.from_stop_id)} → ${stopName(stops, movement.to_stop_id)} · ${formatDistance(movement.distance_meters)}`,
        seconds: movement.time_seconds,
      });
      return;
    }

    if (previousBusRoute && movement.route_id !== previousBusRoute && !transferAdded) {
      steps.push({
        kind: 'transfer',
        title: 'Transbordo',
        detail: `De ${routeName(previousBusRoute, routeLabels)} a ${routeName(movement.route_id, routeLabels)}`,
      });
    }
    if (!previousBusRoute || movement.route_id !== previousBusRoute) {
      steps.push({ kind: 'wait', title: 'Espera en el paradero', detail: 'El servicio no entrega una estimación.' });
    }
    steps.push({
      kind: 'bus',
      title: routeName(movement.route_id, routeLabels),
      detail: `${stopName(stops, movement.from_stop_id)} → ${stopName(stops, movement.to_stop_id)} · ${formatDistance(movement.distance_meters)}`,
      seconds: movement.time_seconds,
    });
    previousBusRoute = movement.route_id;
    transferAdded = false;
  });

  return steps;
}

const STEP_PRESENTATION = {
  walk: { icon: 'walk-outline' as const, color: '#38bdf8' },
  bus: { icon: 'bus-outline' as const, color: '#fb923c' },
  transfer: { icon: 'swap-horizontal-outline' as const, color: '#a78bfa' },
  wait: { icon: 'time-outline' as const, color: '#fbbf24' },
} as const;

function plannerError(error: unknown, fallback: string): string {
  if (error instanceof Error && /rpc error|dial tcp|connectex|connection refused/i.test(error.message)) {
    return 'El servicio de recorridos no está conectado. Inténtalo de nuevo más tarde.';
  }
    return error instanceof Error ? error.message : fallback;
}

function normalizedRouteName(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function occupancyScore(plan: RoutePlan, buses: readonly LiveBus[], routeLabels: Record<string, string>): number | null {
  const cutoff = Date.now() - 30_000;
  const routeIds = [...new Set(plan.movements.filter((movement) => movement.mode === 'bus' && movement.route_id).map((movement) => movement.route_id!))];
  const values = routeIds.flatMap((routeId) => {
    const label = normalizedRouteName(routeLabels[routeId] ?? '');
    const matches = buses.filter((bus) => {
      if (bus.lastUpdate < cutoff || bus.capacity <= 0) return false;
      if (bus.routeId === routeId) return true;
      const busName = normalizedRouteName(`${bus.routeName} ${bus.routeId}`);
      return Boolean(label) && (busName.includes(label) || label.includes(busName));
    });
    return matches.map((bus) => bus.occupancy?.predictedRatio ?? bus.currentPassengers / bus.capacity);
  });
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recommendationFor(
  plans: readonly RoutePlan[],
  preference: Preference,
  buses: readonly LiveBus[],
  routeLabels: Record<string, string>,
): { recommended: RoutePlan | null; alternatives: RoutePlan[]; occupancyAvailable: boolean } {
  const byTime = [...plans].sort((left, right) => left.total_time_seconds - right.total_time_seconds);
  const occupancyByPlan = new Map(plans.map((plan) => [plan, occupancyScore(plan, buses, routeLabels)]));
  const occupancyAvailable = [...occupancyByPlan.values()].some((score) => score !== null);
  let recommended = byTime[0] ?? null;
  if (preference === 'least_walking') {
    recommended = [...plans].sort((left, right) => walkingSeconds(left) - walkingSeconds(right) || left.total_time_seconds - right.total_time_seconds)[0] ?? null;
  } else if (preference === 'least_occupied' && occupancyAvailable) {
    recommended = [...plans].sort((left, right) => {
      const leftScore = occupancyByPlan.get(left) ?? Number.POSITIVE_INFINITY;
      const rightScore = occupancyByPlan.get(right) ?? Number.POSITIVE_INFINITY;
      return leftScore - rightScore || left.total_time_seconds - right.total_time_seconds;
    })[0] ?? null;
  }
  return {
    recommended,
    alternatives: byTime.filter((plan) => plan !== recommended).slice(0, 2),
    occupancyAvailable,
  };
}

function RouteOption({ plan, index, routeLabels, occupancyRatio, stops }: { plan: RoutePlan; index: number; routeLabels: Record<string, string>; occupancyRatio: number | null; stops: readonly Stop[] }) {
  const styles = useStyles();
  const timeline = buildTimeline(plan, stops, routeLabels);
  const recommended = index === 0;
  return (
    <View style={[styles.option, recommended ? styles.recommended : null]}>
      <View style={styles.optionHeader}>
        <View style={[styles.recommendationBadge, recommended ? styles.recommendationBadgeMain : null]}>
          {recommended ? <Ionicons name="sparkles-outline" size={13} color="#07111f" /> : null}
          <Text style={[styles.optionTitle, recommended ? styles.optionTitleMain : null]}>{recommended ? 'RECOMENDADA' : `ALTERNATIVA ${index}`}</Text>
        </View>
        {occupancyRatio !== null ? <Text style={styles.occupancy}>{Math.round(occupancyRatio * 100)}% ocupación</Text> : null}
      </View>
      <View style={styles.totalRow}>
        <View style={styles.totalIcon}><Ionicons name="time-outline" size={21} color="#38bdf8" /></View>
        <View style={styles.totalTextBlock}>
          <Text style={styles.totalLabel}>Tiempo de viaje · sin espera</Text>
          <Text style={styles.duration}>{formatDuration(plan.total_time_seconds)}</Text>
        </View>
        <Text style={styles.totalDistance}>{formatDistance(plan.total_distance_meters)}</Text>
      </View>

      <View style={styles.metricsGrid}>
        <Metric icon="walk-outline" color="#38bdf8" label="Caminata" value={formatSegmentDuration(walkingSeconds(plan))} />
        <Metric icon="bus-outline" color="#fb923c" label="En micro" value={formatSegmentDuration(busSeconds(plan))} />
        <Metric icon="swap-horizontal-outline" color="#a78bfa" label="Transbordos" value={String(plan.transfers)} />
        <Metric icon="time-outline" color="#fbbf24" label="Espera" value="Sin estimación" />
      </View>
      <Text style={styles.timeNote}>La espera no se incluye en el total porque el servicio no la calcula.</Text>

      <View style={styles.timelineHeader}><Text style={styles.timelineTitle}>Detalle del recorrido</Text></View>
      <TimelineEndpoint label="Subida" name={stopName(stops, plan.origin_stop_id)} color="#22c55e" icon="radio-button-on-outline" connectsToNext />
      {timeline.map((step, stepIndex) => <TimelineRow key={`${step.kind}-${stepIndex}`} step={step} />)}
      <TimelineEndpoint label="Bajada" name={stopName(stops, plan.destination_stop_id)} color="#f87171" icon="location-outline" />
    </View>
  );
}

function Metric({ icon, color, label, value }: { icon: 'walk-outline' | 'bus-outline' | 'swap-horizontal-outline' | 'time-outline'; color: string; label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={16} color={color} />
      <View style={styles.metricText}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function TimelineEndpoint({ label, name, color, icon, connectsToNext = false }: { label: string; name: string; color: string; icon: 'radio-button-on-outline' | 'location-outline'; connectsToNext?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIconColumn}>
        <View style={[styles.timelineIcon, { backgroundColor: `${color}20`, borderColor: `${color}60` }]}><Ionicons name={icon} size={17} color={color} /></View>
        {connectsToNext ? <View style={styles.timelineConnector} /> : null}
      </View>
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineKicker}>{label === 'Subida' ? 'INICIO' : 'DESTINO'}</Text>
        <Text style={styles.timelineStepTitle}>{name}</Text>
      </View>
    </View>
  );
}

function TimelineRow({ step }: { step: TimelineStep }) {
  const styles = useStyles();
  const presentation = STEP_PRESENTATION[step.kind];
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIconColumn}>
        <View style={[styles.timelineIcon, { backgroundColor: `${presentation.color}18`, borderColor: `${presentation.color}50` }]}>
          <Ionicons name={presentation.icon} size={17} color={presentation.color} />
        </View>
        <View style={styles.timelineConnector} />
      </View>
      <View style={styles.timelineCopy}>
        <View style={styles.stepTitleRow}>
          <Text style={styles.timelineStepTitle}>{step.title}</Text>
          {step.seconds !== undefined ? <Text style={[styles.stepDuration, { color: presentation.color }]}>{formatDuration(step.seconds)}</Text> : null}
        </View>
        <Text style={styles.timelineDetail}>{step.detail}</Text>
      </View>
    </View>
  );
}

export function TripPlanner({ buses = [], onRecommendationChange }: { buses?: readonly LiveBus[]; onRecommendationChange?: (plan: RoutePlan | null, stops: readonly Stop[]) => void }) {
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
  const [preference, setPreference] = useState<Preference>('fastest');
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const mounted = useRef(false);
  const stopsRequestId = useRef(0);

  const loadStops = useCallback(() => {
    const requestId = ++stopsRequestId.current;
    setLoadingStops(true);
    setStopsError(null);
    Promise.all([fetchAllStops(), fetchTransitRouteLabels().catch(() => ({}))])
      .then(([result, labels]) => {
        if (!mounted.current || requestId !== stopsRequestId.current) return;
        setStops(result.sort((left, right) => left.name.localeCompare(right.name, 'es')));
        setRouteLabels(labels);
      })
      .catch((error: unknown) => {
        if (!mounted.current || requestId !== stopsRequestId.current) return;
        setStopsError(plannerError(error, 'No se pudieron cargar los paraderos.'));
      })
      .finally(() => {
        if (!mounted.current || requestId !== stopsRequestId.current) return;
        setLoadingStops(false);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const loadTimer = setTimeout(loadStops, 0);
    return () => {
      clearTimeout(loadTimer);
      mounted.current = false;
      stopsRequestId.current += 1;
    };
  }, [loadStops]);

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
      setPlanError(plannerError(error, 'No se pudieron calcular los recorridos. Intenta de nuevo.'));
    } finally {
      setPlanning(false);
    }
  };

  const selectionTitle = selection === 'origin' ? 'origen' : 'destino';
  const recommendation = useMemo(
    () => recommendationFor(plans ?? [], preference, buses, routeLabels),
    [buses, plans, preference, routeLabels],
  );

  useEffect(() => {
    onRecommendationChange?.(recommendation.recommended, stops);
  }, [onRecommendationChange, recommendation.recommended, stops]);

  return (
    <View>
      <Text style={styles.intro}>Elige dos paraderos y compara las opciones por tiempo total.</Text>
      {loadingStops ? (
        <LoadingState message="Cargando paraderos…" size="small" />
      ) : stopsError ? (
        <ErrorState message={stopsError} onRetry={loadStops} />
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

          <View style={styles.preferences}>
            <Text style={styles.fieldLabel}>¿Qué prefieres?</Text>
            {PREFERENCE_OPTIONS.map((option) => {
              const selected = preference === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setPreference(option.id)}
                  style={[styles.preference, selected ? styles.preferenceSelected : null]}
                >
                  <View style={[styles.radio, selected ? styles.radioSelected : null]} />
                  <View style={styles.preferenceText}>
                    <Text style={styles.preferenceTitle}>{option.label}</Text>
                    <Text style={styles.helper}>{option.description}</Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={[styles.preference, styles.preferenceDisabled]} accessibilityState={{ disabled: true }}>
              <View style={styles.radio} />
              <View style={styles.preferenceText}>
                <Text style={styles.preferenceTitle}>Evitar lluvia · Próximamente</Text>
                <Text style={styles.helper}>Se activará cuando la app tenga pronóstico meteorológico.</Text>
              </View>
            </View>
          </View>

          <View style={styles.action}>
            <Button title="Buscar recorridos" onPress={planTrip} disabled={!origin || !destination || origin.id === destination.id} loading={planning} loadingTitle="Calculando…" />
          </View>
          {planError ? <ErrorState message={planError} onRetry={planTrip} /> : null}
          {plans?.length ? (
            <View style={styles.results}>
              <Text style={styles.resultsTitle}>Recomendación y alternativas por tiempo total</Text>
              {preference === 'least_occupied' && !recommendation.occupancyAvailable ? (
                <Text style={styles.helper}>No hay ocupación reciente disponible; mostramos la ruta más rápida.</Text>
              ) : null}
              {recommendation.recommended ? <RouteOption plan={recommendation.recommended} index={0} routeLabels={routeLabels} occupancyRatio={occupancyScore(recommendation.recommended, buses, routeLabels)} stops={stops} /> : null}
              {recommendation.alternatives.map((plan, index) => <RouteOption key={`${plan.origin_stop_id}-${plan.destination_stop_id}-${index}`} plan={plan} index={index + 1} routeLabels={routeLabels} occupancyRatio={occupancyScore(plan, buses, routeLabels)} stops={stops} />)}
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
  preferences: { marginTop: spacing.md, gap: spacing.xs },
  preference: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm },
  preferenceSelected: { borderColor: colors.accent, backgroundColor: colors.successBg },
  preferenceDisabled: { opacity: 0.7 },
  preferenceText: { flex: 1 },
  preferenceTitle: { color: colors.text, fontSize: font(13), fontWeight: '600' },
  radio: { width: 18, height: 18, borderRadius: radius.full, borderWidth: 1, borderColor: colors.muted },
  radioSelected: { borderWidth: 5, borderColor: colors.accent },
  results: { marginTop: spacing.md, gap: spacing.sm },
  resultsTitle: { color: colors.text, fontSize: font(14), fontWeight: '700' },
  option: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  recommended: { borderColor: colors.accent, borderLeftWidth: 4 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  recommendationBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.field },
  recommendationBadgeMain: { backgroundColor: '#38bdf8' },
  optionTitle: { color: colors.muted, fontSize: font(10), fontWeight: '800', letterSpacing: 0.5 },
  optionTitleMain: { color: '#07111f' },
  occupancy: { color: colors.muted, fontSize: font(11), fontWeight: '600' },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  totalIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: 'rgba(56,189,248,0.12)' },
  totalTextBlock: { flex: 1 },
  totalLabel: { color: colors.muted, fontSize: font(11) },
  duration: { color: colors.text, fontSize: font(23), lineHeight: font(29), fontWeight: '800', fontVariant: ['tabular-nums'] },
  totalDistance: { color: colors.muted, fontSize: font(12), fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.xs },
  metric: { width: '48.5%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  metricText: { flex: 1, minWidth: 0 },
  metricLabel: { color: colors.muted, fontSize: font(10), lineHeight: font(14) },
  metricValue: { color: colors.text, fontSize: font(12), lineHeight: font(17), fontWeight: '700' },
  timeNote: { color: colors.muted, fontSize: font(10), lineHeight: font(15), marginTop: -spacing.xs },
  timelineHeader: { marginTop: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  timelineTitle: { color: colors.text, fontSize: font(13), fontWeight: '700' },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  timelineIconColumn: { width: 30, alignItems: 'center', position: 'relative' },
  timelineIcon: { zIndex: 1, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1 },
  timelineConnector: { position: 'absolute', top: 29, bottom: 0, width: 2, backgroundColor: colors.border },
  timelineCopy: { flex: 1, justifyContent: 'center', minHeight: 44, paddingBottom: spacing.xs },
  timelineKicker: { color: colors.muted, fontSize: font(9), fontWeight: '700', letterSpacing: 0.6 },
  timelineStepTitle: { color: colors.text, fontSize: font(12), lineHeight: font(17), fontWeight: '700' },
  timelineDetail: { color: colors.muted, fontSize: font(11), lineHeight: font(16), marginTop: 1 },
  stepTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  stepDuration: { fontSize: font(11), fontWeight: '700', fontVariant: ['tabular-nums'] },
}));
