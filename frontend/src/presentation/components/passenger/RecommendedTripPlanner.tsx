import { useEffect, useState } from 'react';
import { CircleMarker, Polyline, Popup } from 'react-leaflet';
import { apiClient } from '../../../infrastructure/api/apiClient';

type Stop = { id: string; name: string; latitude: number; longitude: number };
type Movement = { to_stop_id: string };
type Plan = { origin_stop_id: string; destination_stop_id: string; total_time_seconds: number; movements: Movement[] };

export function RecommendedTripPlanner() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiClient.get('/mapinfo/micro/stops?limit=1000').then(({ data }) => setStops(data?.stops ?? [])).catch(() => setError('No se pudieron cargar los paraderos.'));
  }, []);
  const findRoute = async () => {
    setError(''); setPlan(null);
    try {
      const { data } = await apiClient.get('/integrations/micro/routes/plan', { params: { from_stop: origin, to_stop: destination, preference: 'fastest' } });
      setPlan(data);
    } catch { setError('No encontramos una ruta entre esos paraderos.'); }
  };
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const selected = plan ? [byId.get(plan.origin_stop_id), ...plan.movements.map(({ to_stop_id }) => byId.get(to_stop_id))].filter((stop): stop is Stop => Boolean(stop)) : [];
  const coords = selected.map(({ latitude, longitude }) => [latitude, longitude] as [number, number]);
  const endpoints = [byId.get(plan?.origin_stop_id ?? ''), byId.get(plan?.destination_stop_id ?? '')];
  return <>
    <div className="trip-planner-control">
      <strong>Planifica tu viaje</strong>
      <select aria-label="Paradero de subida" value={origin} onChange={(event) => { setOrigin(event.target.value); setPlan(null); }}><option value="">Subida</option>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
      <select aria-label="Paradero de bajada" value={destination} onChange={(event) => { setDestination(event.target.value); setPlan(null); }}><option value="">Bajada</option>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}</select>
      <button type="button" disabled={!origin || !destination || origin === destination} onClick={findRoute}>Ver ruta recomendada</button>
      {error && <small>{error}</small>}{plan && <small>Ruta recomendada · {Math.ceil(plan.total_time_seconds / 60)} min</small>}
    </div>
    {coords.length > 1 && <Polyline positions={coords} pathOptions={{ color: '#f97316', weight: 6, opacity: 0.95 }} />}
    {endpoints.map((stop, index) => stop ? <CircleMarker key={`${index}-${stop.id}`} center={[stop.latitude, stop.longitude]} radius={9} pathOptions={{ color: index === 0 ? '#15803d' : '#b91c1c', fillColor: index === 0 ? '#22c55e' : '#ef4444', fillOpacity: 1, weight: 3 }}><Popup><strong>Paradero de {index === 0 ? 'subida' : 'bajada'}</strong><br />{stop.name}</Popup></CircleMarker> : null)}
  </>;
}
