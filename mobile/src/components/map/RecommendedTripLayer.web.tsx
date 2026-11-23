import { CircleMarker, Polyline, Popup } from 'react-leaflet';
import type { Stop } from '../../location/geo';
import type { RoutePlan } from '../../api/tripPlannerApi';

export function RecommendedTripLayer({ plan, stops }: { plan: RoutePlan | null; stops: readonly Stop[] }) {
  if (!plan) return null;
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const ids = [plan.origin_stop_id, ...plan.movements.map((movement) => movement.to_stop_id)];
  const coordinates = ids.map((id) => byId.get(id)).filter((stop): stop is Stop => Boolean(stop)).map(({ latitude, longitude }) => [latitude, longitude] as [number, number]);
  const origin = byId.get(plan.origin_stop_id);
  const destination = byId.get(plan.destination_stop_id);
  const endpoints = [
    { stop: origin, label: 'subida', color: '#15803d', fill: '#22c55e' },
    { stop: destination, label: 'bajada', color: '#b91c1c', fill: '#ef4444' },
  ];
  return <>
    {coordinates.length > 1 ? <Polyline positions={coordinates} pathOptions={{ color: '#f97316', weight: 7, opacity: 1 }} /> : null}
    {endpoints.map(({ stop, label, color, fill }) => stop ? <CircleMarker key={`${label}-${stop.id}`} center={[stop.latitude, stop.longitude]} radius={10} pathOptions={{ color, fillColor: fill, fillOpacity: 1, weight: 3 }}><Popup><strong>Paradero de {label}</strong><br />{stop.name}</Popup></CircleMarker> : null)}
  </>;
}
