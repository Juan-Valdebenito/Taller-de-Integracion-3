import { useState } from 'react';
import { View } from 'react-native';

import { LocationCard } from '../components/LocationCard';
import { NearbyStopCard } from '../components/NearbyStopCard';
import { ProximityAlertsCard } from '../components/ProximityAlertsCard';
import { BusMarkersLayer } from '../components/map/BusMarkersLayer';
import { ConnectionOverlay } from '../components/map/ConnectionOverlay';
import { MapPanel } from '../components/map/MapPanel';
import { MapStatusBar } from '../components/map/MapStatusBar';
import { filterBusesByRoute, RouteFilter } from '../components/map/RouteFilter';
import { RouteNodesLayer } from '../components/map/RouteNodesLayer';
import type { RouteFilterValue } from '../components/map/routeNodes';
import { TransitMap } from '../components/map/TransitMap';
import { UserLocationLayer } from '../components/map/UserLocationLayer';
import { useLocation } from '../hooks/useLocation';
import { useNearestStop } from '../hooks/useNearestStop';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { useMapBuses } from '../realtime/useMapBuses';
import { useSettings } from '../settings/SettingsContext';
import { makeStyles } from '../theme';

/**
 * Pestaña Mapa del pasajero, como PassengerMapPage del web en un teléfono: el
 * mapa de Temuco ocupa toda la pantalla (el web oculta su panel lateral bajo
 * 640 px) con las paradas, las micros (en tiempo real o simuladas, como el
 * web) y tu ubicación, con la barra de estado de la conexión y el filtro por
 * línea (micros y paradas de la línea elegida) arriba, y el
 * aviso de conexión perdida sobre el mapa. La ubicación, el paradero más
 * cercano y las alertas de proximidad quedan en un panel flotante plegable.
 */
export function MapScreen() {
  const styles = useStyles();
  const location = useLocation();
  const { buses, source, realtime } = useMapBuses();
  // Tocar una micro la selecciona; tocarla de nuevo la deselecciona (como el web).
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const selectBus = (id: string) => setSelectedBusId((current) => (current === id ? null : id));
  const [routeFilter, setRouteFilter] = useState<RouteFilterValue>('all');
  const visibleBuses = filterBusesByRoute(buses, routeFilter);
  const nearby = useNearestStop(location.position);
  const { settings } = useSettings();
  const alerts = useProximityAlerts(nearby.proximity, {
    vibrate: settings.vibrationEnabled,
    notify: settings.notificationsEnabled,
  });

  const summary = location.position
    ? 'Ubicación activa · paradero más cercano y alertas'
    : 'Activa tu ubicación para ver el paradero más cercano y las alertas';

  return (
    <View style={styles.screen}>
      <MapStatusBar buses={buses} realtime={realtime} routeFilter={routeFilter} />
      <RouteFilter buses={buses} value={routeFilter} onChange={setRouteFilter} />
      <View style={styles.mapArea}>
        <TransitMap>
          <RouteNodesLayer routeFilter={routeFilter} />
          <BusMarkersLayer buses={visibleBuses}selectedId={selectedBusId} onSelect={selectBus} live={source === 'realtime'} />
          <UserLocationLayer position={location.position} />
        </TransitMap>
        <ConnectionOverlay status={realtime.status} />
        <MapPanel title="📍 Tu ubicación y alertas" summary={summary}>
          <LocationCard location={location} />
          <NearbyStopCard nearby={nearby} hasPosition={location.position !== null} />
          <ProximityAlertsCard alerts={alerts} />
        </MapPanel>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  mapArea: { flex: 1 },
}));
