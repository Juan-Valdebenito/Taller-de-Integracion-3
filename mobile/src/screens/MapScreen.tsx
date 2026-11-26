import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { liveBusesToPositions } from '../alerts/proximityAlerts';
import { LocationCard } from '../components/LocationCard';
import { NearbyStopCard } from '../components/NearbyStopCard';
import { ProximityAlertsCard } from '../components/ProximityAlertsCard';
import { BusDetailCard } from '../components/map/BusDetailCard';
import { BusList, busListSummary } from '../components/map/BusList';
import { BusMarkersLayer } from '../components/map/BusMarkersLayer';
import { ConnectionOverlay } from '../components/map/ConnectionOverlay';
import { MapPanel } from '../components/map/MapPanel';
import { MapStatusBar } from '../components/map/MapStatusBar';
import { TripPlanner } from '../components/map/TripPlanner';
import { filterBusesByRoute, RouteFilter } from '../components/map/RouteFilter';
import { RouteNodesLayer } from '../components/map/RouteNodesLayer';
import { RecommendedTripLayer } from '../components/map/RecommendedTripLayer';
import type { RoutePlan } from '../api/tripPlannerApi';
import type { RouteStop } from '../api/companyApi';
import type { Stop } from '../location/geo';
import type { RouteFilterValue } from '../components/map/routeNodes';
import { TransitMap } from '../components/map/TransitMap';
import { UserLocationLayer } from '../components/map/UserLocationLayer';
import { useLocation } from '../hooks/useLocation';
import { useNearestStop } from '../hooks/useNearestStop';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { useMapBuses } from '../realtime/useMapBuses';
import { useSettings } from '../settings/SettingsContext';
import { makeStyles, spacing } from '../theme';

/**
 * Pestaña Mapa del pasajero, como PassengerMapPage del web en un teléfono: el
 * mapa de Temuco ocupa toda la pantalla (el web oculta su panel lateral bajo
 * 640 px) con las paradas, las micros en tiempo real
 * y tu ubicación, con la barra de estado de la conexión y el filtro por
 * línea (micros y paradas de la línea elegida) arriba, y el
 * aviso de conexión perdida sobre el mapa. Abajo van paneles plegables
 * (al abrir uno se pliega el otro): "Micros activas", la lista lateral del
 * web, y la ubicación con el paradero más cercano y las alertas. Al tocar una
 * micro, su ficha ocupa ese lugar hasta cerrarla.
 */
export function MapScreen() {
  const styles = useStyles();
  const location = useLocation();
  const { buses, live, realtime, routes, routesLoading, routesError } = useMapBuses();
  // Tocar una micro la selecciona; tocarla de nuevo la deselecciona (como el web).
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const selectBus = (id: string) => setSelectedBusId((current) => (current === id ? null : id));
  const [routeFilter, setRouteFilter] = useState<RouteFilterValue>('all');
  const routeStopsByRoute = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.id, route.stops])) as Record<string, RouteStop[]>,
    [routes],
  );
  const [recommendedTrip, setRecommendedTrip] = useState<{ plan: RoutePlan | null; stops: readonly Stop[] }>({ plan: null, stops: [] });
  const updateRecommendedTrip = useCallback((plan: RoutePlan | null, stops: readonly Stop[]) => {
    setRecommendedTrip((current) => current.plan === plan && current.stops === stops ? current : { plan, stops });
  }, []);
  const recommendedCoordinates = useMemo(() => {
    const plan = recommendedTrip.plan;
    if (!plan) return [];
    const stopsById = new Map(recommendedTrip.stops.map((stop) => [stop.id, stop]));
    return [plan.origin_stop_id, ...plan.movements.map((movement) => movement.to_stop_id)]
      .map((id) => stopsById.get(id))
      .filter((stop): stop is Stop => Boolean(stop))
      .map(({ latitude, longitude }) => ({ latitude, longitude }));
  }, [recommendedTrip]);
  const visibleBuses = filterBusesByRoute(buses, routeFilter);
  // La ficha se cierra sola si la micro elegida queda fuera del filtro o deja de existir.
  const selectedBus = visibleBuses.find((bus) => bus.id === selectedBusId) ?? null;
  // Como el web: la lista muestra filas de carga mientras se conecta por primera vez.
  const loadingBuses = realtime.status === 'connecting' && realtime.totalMessages === 0;
  // Paneles de abajo como acordeón: abrir uno pliega el otro.
  const [openPanel, setOpenPanel] = useState<'buses' | 'location' | 'planner' | null>(null);
  const nearby = useNearestStop(location.position);
  const { settings } = useSettings();
  // Las alertas usan las micros del tiempo real; sin conexión consultan al
  // servidor.
  const liveBuses = useMemo(() => (live ? liveBusesToPositions(buses) : null), [live, buses]);
  const alerts = useProximityAlerts(nearby.proximity, {
    vibrate: settings.vibrationEnabled,
    notify: settings.notificationsEnabled,
    liveBuses,
  });

  const summary = location.position
    ? 'Ubicación activa · paradero más cercano y alertas'
    : 'Activa tu ubicación para ver el paradero más cercano y las alertas';

  return (
    <View style={styles.screen}>
      <MapStatusBar buses={buses} realtime={realtime} routeFilter={routeFilter} />
      <RouteFilter buses={buses} routes={routes} value={routeFilter} onChange={setRouteFilter} />
      <View style={styles.mapArea}>
        <TransitMap fitCoordinates={recommendedCoordinates}>
          <RouteNodesLayer routeFilter={routeFilter} routes={routes} />
          <RecommendedTripLayer plan={recommendedTrip.plan} stops={recommendedTrip.stops} />
          <BusMarkersLayer buses={visibleBuses} selectedId={selectedBusId} onSelect={selectBus} live={live} />
          <UserLocationLayer position={location.position} />
        </TransitMap>
        {routesLoading || routesError ? (
          <View pointerEvents="none" style={styles.routeNotice} accessibilityRole="status">
            <Text style={styles.routeNoticeText}>{routesLoading ? 'Cargando rutas reales...' : routesError}</Text>
          </View>
        ) : null}
        <ConnectionOverlay status={realtime.status} />
        {selectedBus ? (
          <BusDetailCard
            bus={selectedBus}
            live={live && selectedBus.dataSource !== 'simulation' && !selectedBus.id.startsWith('sim-')}
            routeStops={routeStopsByRoute[selectedBus.routeId] ?? []}
            onClose={() => setSelectedBusId(null)}
          />
        ) : (
          <View style={styles.panels}>
            <MapPanel
              title="Micros activas"
              summary={busListSummary(visibleBuses.length)}
              open={openPanel === 'buses'}
              onOpenChange={(open) => setOpenPanel(open ? 'buses' : null)}
              flush
            >
              <BusList
                buses={visibleBuses}
                selectedId={selectedBusId}
                onSelect={selectBus}
                live={live}
                loading={loadingBuses}
                routeStopsByRoute={routeStopsByRoute}
              />
            </MapPanel>
            <MapPanel
              title="🧭 Planificar viaje"
              summary="Compara recorridos por tiempo total"
              open={openPanel === 'planner'}
              onOpenChange={(open) => setOpenPanel(open ? 'planner' : null)}
            >
              <TripPlanner buses={live ? buses : []} onRecommendationChange={updateRecommendedTrip} />
            </MapPanel>
            <MapPanel
              title="📍 Tu ubicación y alertas"
              summary={summary}
              open={openPanel === 'location'}
              onOpenChange={(open) => setOpenPanel(open ? 'location' : null)}
            >
              <LocationCard location={location} />
              <NearbyStopCard nearby={nearby} hasPosition={location.position !== null} />
              <ProximityAlertsCard alerts={alerts} />
            </MapPanel>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  mapArea: { flex: 1 },
  panels: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm, maxHeight: '70%', gap: spacing.sm },
  routeNotice: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, alignItems: 'center' },
  routeNoticeText: { overflow: 'hidden', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, color: '#fbbf24', backgroundColor: 'rgba(15, 23, 42, 0.9)', fontSize: 12, textAlign: 'center' },
}));
