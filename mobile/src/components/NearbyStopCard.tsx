import { Text, View } from 'react-native';

import { MAX_LOCATION_ACCURACY_M, STOP_SEARCH_RADIUS_M } from '../config';
import type { UseNearestStopResult } from '../hooks/useNearestStop';
import { formatDistance } from '../location/geo';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';

/**
 * Paradero oficial más cercano y si el usuario está dentro del radio que
 * habilita las alertas de proximidad. Sin posición no se muestra (la tarjeta de
 * ubicación ya guía al usuario).
 */
export function NearbyStopCard({ nearby, hasPosition }: { nearby: UseNearestStopResult; hasPosition: boolean }) {
  const styles = useStyles();
  if (!hasPosition) return null;
  const { proximity, loading, error, reload } = nearby;

  let title = 'Paraderos cercanos';
  let description: string | null = null;
  let tone: 'ok' | 'warning' | 'neutral' = 'neutral';

  if (proximity) {
    const { status, nearest, radiusMeters } = proximity;
    const place = nearest ? `${nearest.stop.name} · a ${formatDistance(nearest.distanceMeters)}` : '';
    if (status === 'inside') {
      title = 'Estás en un paradero';
      description = `${place}. Estás dentro del radio de ${formatDistance(radiusMeters)} de un paradero oficial.`;
      tone = 'ok';
    } else if (status === 'outside') {
      title = 'No estás en un paradero';
      description = `Paradero más cercano: ${place}. Acércate a menos de ${formatDistance(radiusMeters)} para recibir alertas de proximidad.`;
    } else if (status === 'low-accuracy') {
      title = 'Ubicación poco precisa';
      description = `No podemos confirmar si estás en el paradero (${place}). Se necesita una precisión de ±${formatDistance(MAX_LOCATION_ACCURACY_M)} o mejor: actualiza tu ubicación, idealmente al aire libre.`;
      tone = 'warning';
    } else {
      description = `No hay paraderos oficiales a menos de ${formatDistance(STOP_SEARCH_RADIUS_M)} de tu ubicación.`;
    }
  } else if (loading) {
    description = 'Buscando paraderos cercanos…';
  }

  return (
    <View
      style={[styles.card, tone === 'ok' && styles.ok, tone === 'warning' && styles.warning]}
      accessibilityLabel="Paradero más cercano"
    >
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {proximity || error ? (
        <View style={styles.action}>
          <Button
            title={error ? 'Reintentar' : 'Actualizar paraderos'}
            onPress={reload}
            loading={loading}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors, font) => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  ok: { backgroundColor: colors.successBg },
  warning: { backgroundColor: colors.warningBg },
  title: { fontSize: font(16), fontWeight: '700', color: colors.text },
  description: { marginTop: spacing.xs, fontSize: font(14), color: colors.muted, lineHeight: font(20) },
  error: { marginTop: spacing.sm, fontSize: font(14), color: colors.danger },
  action: { marginTop: spacing.sm, alignItems: 'flex-start' },
}));
