import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationCard } from '../components/LocationCard';
import { NearbyStopCard } from '../components/NearbyStopCard';
import { ProximityAlertsCard } from '../components/ProximityAlertsCard';
import { RouteNodesLayer } from '../components/map/RouteNodesLayer';
import { TransitMap } from '../components/map/TransitMap';
import { useLocation } from '../hooks/useLocation';
import { useNearestStop } from '../hooks/useNearestStop';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { useSettings } from '../settings/SettingsContext';
import { makeStyles, spacing } from '../theme';

/**
 * Pestaña Mapa del pasajero, como PassengerMapPage del web: el mapa de Temuco
 * y, debajo, un panel (en el web, el panel lateral). Por ahora el panel tiene
 * la ubicación, el paradero más cercano y las alertas de proximidad.
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

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <TransitMap style={styles.map}>
        <RouteNodesLayer routeFilter="all" />
      </TransitMap>
      <View style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelContent}>
          <LocationCard location={location} />
          <NearbyStopCard nearby={nearby} hasPosition={location.position !== null} />
          <ProximityAlertsCard alerts={alerts} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// Panel como .map-side-panel del web: --color-surface-1 con borde.
const useStyles = makeStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  map: { flex: 3 },
  panel: { flex: 2, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  panelContent: { padding: spacing.md },
}));
