import { View } from 'react-native';

import { LocationCard } from '../components/LocationCard';
import { NearbyStopCard } from '../components/NearbyStopCard';
import { ProximityAlertsCard } from '../components/ProximityAlertsCard';
import { MapPanel } from '../components/map/MapPanel';
import { RouteNodesLayer } from '../components/map/RouteNodesLayer';
import { TransitMap } from '../components/map/TransitMap';
import { UserLocationLayer } from '../components/map/UserLocationLayer';
import { useLocation } from '../hooks/useLocation';
import { useNearestStop } from '../hooks/useNearestStop';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { useSettings } from '../settings/SettingsContext';
import { makeStyles } from '../theme';

/**
 * Pestaña Mapa del pasajero, como PassengerMapPage del web en un teléfono: el
 * mapa de Temuco ocupa toda la pantalla (el web oculta su panel lateral bajo
 * 640 px) con las paradas y tu ubicación. La ubicación, el paradero más
 * cercano y las alertas de proximidad quedan en un panel flotante plegable.
 */
export function MapScreen() {
  const styles = useStyles();
  const location = useLocation();
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
      <TransitMap>
        <RouteNodesLayer routeFilter="all" />
        <UserLocationLayer position={location.position} />
      </TransitMap>
      <MapPanel title="📍 Tu ubicación y alertas" summary={summary}>
        <LocationCard location={location} />
        <NearbyStopCard nearby={nearby} hasPosition={location.position !== null} />
        <ProximityAlertsCard alerts={alerts} />
      </MapPanel>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
}));
