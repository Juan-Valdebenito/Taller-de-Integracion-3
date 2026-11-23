import { Marker, Polyline } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import type { Stop } from '../../location/geo';
import type { RoutePlan } from '../../api/tripPlannerApi';

export function RecommendedTripLayer({ plan, stops }: { plan: RoutePlan | null; stops: readonly Stop[] }) {
  if (!plan) return null;
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const ids = [plan.origin_stop_id, ...plan.movements.map((movement) => movement.to_stop_id)];
  const coordinates = ids
    .map((id) => byId.get(id))
    .filter((stop): stop is Stop => Boolean(stop))
    .map(({ latitude, longitude }) => ({ latitude, longitude }));
  const origin = byId.get(plan.origin_stop_id);
  const destination = byId.get(plan.destination_stop_id);
  const endpoints = [
    { stop: origin, label: 'SUBIDA', color: '#15803d' },
    { stop: destination, label: 'BAJADA', color: '#b91c1c' },
  ];
  return <>
    {coordinates.length > 1 ? <Polyline coordinates={coordinates} strokeColor="#f97316" strokeWidth={7} zIndex={10} /> : null}
    {endpoints.map(({ stop, label, color }) => stop ? (
      <Marker
        key={`${label}-${stop.id}`}
        coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
        anchor={{ x: 0.5, y: 1 }}
        zIndex={20}
        tracksViewChanges={false}
        accessibilityLabel={`Paradero de ${label.toLocaleLowerCase('es')}: ${stop.name}`}
      >
        <View style={styles.marker} collapsable={false}>
          <View style={[styles.label, { borderColor: color }]}>
            <Text style={[styles.labelTitle, { color }]}>{label}</Text>
            <Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      </Marker>
    ) : null)}
  </>;
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
  label: { maxWidth: 230, marginBottom: 5, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderRadius: 8, backgroundColor: '#171b24' },
  labelTitle: { fontSize: 10, lineHeight: 13, fontWeight: '800' },
  stopName: { color: '#f8fafc', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  dot: { width: 17, height: 17, borderRadius: 9, borderWidth: 3, borderColor: '#ffffff' },
});
