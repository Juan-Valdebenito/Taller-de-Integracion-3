import { Text, View } from 'react-native';

import { ALERT_RADIUS_M } from '../config';
import type { UseProximityAlertsResult } from '../hooks/useProximityAlerts';
import { formatDistance } from '../location/geo';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';

/** Cuántas micros cercanas se listan como máximo. */
const MAX_LISTED = 3;

/**
 * Alertas de proximidad: activas solo con el paradero confirmado por la
 * geolocalización; si no, explica por qué están en pausa.
 */
export function ProximityAlertsCard({ alerts }: { alerts: UseProximityAlertsResult }) {
  const styles = useStyles();
  const { enabled, pausedReason, stop, approaching, alert, dismissAlert, loading, error, checkNow, live } = alerts;

  if (!enabled) {
    return (
      <View style={styles.card} accessibilityLabel="Alertas de proximidad">
        <Text style={styles.title}>Alertas de proximidad en pausa</Text>
        <Text style={styles.description}>{pausedReason}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel="Alertas de proximidad">
      {alert ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {alert.message}
          </Text>
          <View style={styles.action}>
            <Button title="Entendido" onPress={dismissAlert} variant="secondary" />
          </View>
        </View>
      ) : null}
      <Text style={styles.title}>Alertas activas</Text>
      <Text style={styles.description}>
        Te avisaremos cuando una micro esté a menos de {formatDistance(ALERT_RADIUS_M)} de {stop?.name}.
      </Text>
      {approaching.length > 0 ? (
        approaching.slice(0, MAX_LISTED).map(({ bus, distanceMeters }) => (
          <Text key={bus.id} style={styles.bus}>
            {bus.patente || 'Micro sin patente'} · a {formatDistance(distanceMeters)}
          </Text>
        ))
      ) : (
        <Text style={styles.description}>{loading ? 'Buscando micros cercanas…' : 'Ninguna micro se acerca por ahora.'}</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {live ? (
        <Text style={styles.live}>📡 En tiempo real: se revisa con cada posición de las micros.</Text>
      ) : (
        <View style={styles.action}>
          <Button title="Buscar micros ahora" onPress={checkNow} loading={loading} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  banner: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  bannerText: { fontSize: font(15), fontWeight: '700', color: colors.warning },
  title: { fontSize: font(16), fontWeight: '700', color: colors.text },
  description: { marginTop: spacing.xs, fontSize: font(14), color: colors.muted, lineHeight: font(20) },
  bus: { marginTop: spacing.xs, fontSize: font(15), fontWeight: '600', color: colors.text },
  error: { marginTop: spacing.sm, fontSize: font(14), color: colors.danger },
  action: { marginTop: spacing.sm, alignItems: 'flex-start' },
  live: { marginTop: spacing.sm, fontSize: font(13), color: '#c084fc', lineHeight: font(18) },
}));
