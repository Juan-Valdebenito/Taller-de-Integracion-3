import { StyleSheet, Text, View } from 'react-native';

import type { UseLocationResult } from '../hooks/useLocation';
import { colors, radius, spacing } from '../theme';
import { Button } from './Button';

/** Coordenadas con 5 decimales (~1 m de resolución). */
export function formatPosition(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/**
 * Tarjeta de estado de la ubicación: explica para qué se usa, pide el permiso
 * cuando el usuario lo decide y guía a Ajustes si quedó bloqueado.
 */
export function LocationCard({ location }: { location: UseLocationResult }) {
  const { permission, position, locating, error, requestAndLocate, refresh, openSettings } = location;

  let title = 'Ubicación';
  let description: string;
  let action: { title: string; onPress: () => void } | null = null;

  if (permission === null) {
    description = 'Revisando el permiso de ubicación…';
  } else if (permission === 'undetermined') {
    description = 'Activa tu ubicación para saber si estás cerca de un paradero y recibir alertas de proximidad.';
    action = { title: 'Activar ubicación', onPress: requestAndLocate };
  } else if (permission === 'denied') {
    description = 'Sin permiso de ubicación no podemos verificar si estás cerca de un paradero.';
    action = { title: 'Permitir ubicación', onPress: requestAndLocate };
  } else if (permission === 'blocked') {
    description = 'El permiso de ubicación está desactivado para TransitHub. Puedes activarlo desde los ajustes del teléfono.';
    action = { title: 'Abrir ajustes', onPress: openSettings };
  } else if (position) {
    title = 'Ubicación activa';
    const accuracy = position.accuracy != null ? ` · precisión ±${Math.round(position.accuracy)} m` : '';
    description = `${formatPosition(position.latitude, position.longitude)}${accuracy}`;
    action = { title: 'Actualizar ubicación', onPress: refresh };
  } else {
    description = locating ? 'Obteniendo tu ubicación…' : 'Permiso concedido. Toca para obtener tu ubicación.';
    action = { title: 'Obtener ubicación', onPress: refresh };
  }

  return (
    <View style={styles.card} accessibilityLabel="Estado de la ubicación">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button title={action.title} onPress={action.onPress} loading={locating} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  description: { marginTop: spacing.xs, fontSize: 14, color: colors.muted, lineHeight: 20 },
  error: { marginTop: spacing.sm, fontSize: 14, color: colors.danger },
  action: { marginTop: spacing.sm, alignItems: 'flex-start' },
});
