/**
 * RecommendedTripPlanner.tsx
 *
 * Control superpuesto en el mapa Leaflet que permite al pasajero planificar un viaje:
 *  - Buscador de paradero de subida y bajada (con filtro de texto)
 *  - Llama a fetchRouteAlternatives y muestra la ruta recomendada + alternativas
 *  - Dibuja en el mapa: Polyline naranja (recorrido) + CircleMarker verde (subida) y rojo (bajada)
 *  - Muestra tiempo total estimado
 */

import { useEffect, useRef, useState } from 'react';
import { CircleMarker, Polyline, Popup } from 'react-leaflet';
import {
  fetchAllStops,
  fetchRouteAlternatives,
  fetchWeatherTelemetry,
  type RoutePlan,
  type Stop,
  type WeatherTelemetry,
} from '../../../infrastructure/api/tripPlannerApi';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h ${remainder} min` : `${minutes} min`;
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function latestWeather(records: WeatherTelemetry[]): WeatherTelemetry | null {
  return [...records].sort((left, right) => right.time.localeCompare(left.time))[0] ?? null;
}

function distanceInMeters(from: Stop, to: Pick<WeatherTelemetry, 'latitude' | 'longitude'>): number {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDistance = toRadians(to.latitude - from.latitude);
  const longitudeDistance = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDistance / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function weatherForStop(records: WeatherTelemetry[], stop: Stop | null): WeatherTelemetry | null {
  if (!records.length) return null;
  if (!stop) return latestWeather(records);
  return [...records]
    .sort((left, right) => distanceInMeters(stop, left) - distanceInMeters(stop, right))
    [0] ?? null;
}

function weatherAlerts(weather: WeatherTelemetry): string[] {
  const alerts: string[] = [];
  if (weather.humidity_pct >= 85) alerts.push('Alta humedad: posible lluvia o ambiente muy húmedo.');
  if (weather.temperature_c >= 30) alerts.push(`Calor elevado (${Math.round(weather.temperature_c)} °C): lleva agua y protege tu ruta peatonal.`);
  if (weather.temperature_c <= 8) alerts.push(`Temperatura baja (${Math.round(weather.temperature_c)} °C): considera abrigo para caminar.`);
  if (weather.wind_speed_kmh >= 30) alerts.push(`Viento fuerte (${Math.round(weather.wind_speed_kmh)} km/h): precaución al esperar.`);
  if (weather.pm25_ug_m3 >= 35) alerts.push(`PM2.5 elevado (${Math.round(weather.pm25_ug_m3)} µg/m³): reduce tiempos de exposición.`);
  if (alerts.length === 0) alerts.push('Condiciones favorables para iniciar el recorrido.');
  return alerts;
}

function routeWeatherAlert(plan: RoutePlan, weather: WeatherTelemetry): string | null {
  const walkingSeconds = plan.movements
    .filter((movement) => movement.mode === 'walk')
    .reduce((total, movement) => total + movement.time_seconds, 0);
  const unfavorable = weather.humidity_pct >= 85
    || weather.temperature_c >= 30
    || weather.temperature_c <= 8
    || weather.wind_speed_kmh >= 30
    || weather.pm25_ug_m3 >= 35;
  if (!unfavorable) return null;
  if (walkingSeconds > 0) {
    return `Contexto de clima: esta opción incluye ${formatDuration(walkingSeconds)} a pie. Evalúa abrigo, agua o una alternativa con menos caminata.`;
  }
  return 'Contexto de clima: esta opción evita caminatas, útil con las condiciones climáticas actuales.';
}

// ── Sub-componente: selector de paradero con búsqueda ─────────────────────────

interface StopPickerProps {
  label: string;
  value: Stop | null;
  stops: Stop[];
  excludeId?: string;
  onSelect: (stop: Stop) => void;
}

function StopPicker({ label, value, stops, excludeId, onSelect }: StopPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = stops
    .filter((s) => s.id !== excludeId)
    .filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const handleSelect = (stop: Stop) => {
    onSelect(stop);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className="tpp-stop-field">
      <span className="tpp-field-label">{label}</span>
      <button
        type="button"
        className={`tpp-stop-btn${value ? '' : ' tpp-placeholder'}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {value ? value.name : 'Selecciona un paradero…'}
        <span className="tpp-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="tpp-dropdown">
          <input
            ref={inputRef}
            className="tpp-search"
            placeholder="Buscar paradero…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 && (
            <p className="tpp-empty">No hay paraderos que coincidan.</p>
          )}
          {filtered.map((stop) => (
            <button
              key={stop.id}
              type="button"
              className="tpp-option"
              onClick={() => handleSelect(stop)}
            >
              {stop.name}
            </button>
          ))}
          <button type="button" className="tpp-cancel" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Capa visual en el mapa ────────────────────────────────────────────────────

interface TripLayerProps {
  plan: RoutePlan;
  stops: Stop[];
}

function TripLayer({ plan, stops }: TripLayerProps) {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const ids = [plan.origin_stop_id, ...plan.movements.map((m) => m.to_stop_id)];
  const coords = ids
    .map((id) => byId.get(id))
    .filter((s): s is Stop => Boolean(s))
    .map(({ latitude, longitude }) => [latitude, longitude] as [number, number]);

  const origin = byId.get(plan.origin_stop_id);
  const destination = byId.get(plan.destination_stop_id);
  const endpoints = [
    { stop: origin, label: 'subida', color: '#15803d', fill: '#22c55e' },
    { stop: destination, label: 'bajada', color: '#b91c1c', fill: '#ef4444' },
  ];

  return (
    <>
      {coords.length > 1 && (
        <Polyline
          positions={coords}
          pathOptions={{ color: '#f97316', weight: 7, opacity: 1, lineJoin: 'round' }}
        />
      )}
      {endpoints.map(({ stop, label, color, fill }) =>
        stop ? (
          <CircleMarker
            key={`${label}-${stop.id}`}
            center={[stop.latitude, stop.longitude]}
            radius={11}
            pathOptions={{ color, fillColor: fill, fillOpacity: 1, weight: 3 }}
          >
            <Popup>
              <strong>Paradero de {label}</strong>
              <br />
              {stop.name}
            </Popup>
          </CircleMarker>
        ) : null,
      )}
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function RecommendedTripPlanner() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsError, setStopsError] = useState('');
  const [weather, setWeather] = useState<WeatherTelemetry[]>([]);
  const [weatherError, setWeatherError] = useState('');
  const [origin, setOrigin] = useState<Stop | null>(null);
  const [destination, setDestination] = useState<Stop | null>(null);
  const [plans, setPlans] = useState<RoutePlan[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  // Cargar paraderos y clima al montar
  useEffect(() => {
    fetchAllStops()
      .then(setStops)
      .catch(() => setStopsError('No se pudieron cargar los paraderos.'));
    fetchWeatherTelemetry()
      .then(setWeather)
      .catch(() => setWeatherError('No se pudo cargar la información climática.'));
  }, []);

  const findRoute = async () => {
    if (!origin || !destination) return;
    setPlanning(true);
    setPlanError('');
    setPlans(null);
    setSelectedIndex(0);
    try {
      const result = await fetchRouteAlternatives(origin, destination);
      if (result.length === 0) {
        setPlanError('No encontramos un recorrido entre esos paraderos.');
      } else {
        setPlans(result);
      }
    } catch {
      setPlanError('No se pudieron calcular los recorridos. Intenta de nuevo.');
    } finally {
      setPlanning(false);
    }
  };

  const reset = () => {
    setOrigin(null);
    setDestination(null);
    setPlans(null);
    setPlanError('');
  };

  const activePlan = plans?.[selectedIndex] ?? null;
  const currentWeather = weatherForStop(weather, origin);
  const alerts = currentWeather ? weatherAlerts(currentWeather) : [];
  const activeRouteWeatherAlert = activePlan && currentWeather
    ? routeWeatherAlert(activePlan, currentWeather)
    : null;
  const canSearch = Boolean(origin && destination && origin.id !== destination.id);

  return (
    <>
      {/* ── Capa visual en el mapa ── */}
      {activePlan && <TripLayer plan={activePlan} stops={stops} />}

      {/* ── Panel de control superpuesto ── */}
      <div className={`tpp-panel${collapsed ? ' tpp-collapsed' : ''}`}>
        {/* Cabecera */}
        <div className="tpp-header">
          <strong className="tpp-title">🧭 Planificar viaje</strong>
          <button
            type="button"
            className="tpp-toggle"
            aria-label={collapsed ? 'Expandir planificador' : 'Contraer planificador'}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>

        {!collapsed && (
          <div className="tpp-body">
            {stopsError && <p className="tpp-error">{stopsError}</p>}

            {currentWeather ? (
              <div className="tpp-weather">
                <div className="tpp-weather-grid">
                  <div className="tpp-weather-card">
                    <span>🌡️ Temperatura</span>
                    <strong>{Math.round(currentWeather.temperature_c)} °C</strong>
                  </div>
                  <div className="tpp-weather-card">
                    <span>💧 Humedad</span>
                    <strong>{Math.round(currentWeather.humidity_pct)}%</strong>
                  </div>
                  <div className="tpp-weather-card">
                    <span>🌬️ Viento</span>
                    <strong>{Math.round(currentWeather.wind_speed_kmh)} km/h</strong>
                  </div>
                  <div className="tpp-weather-card">
                    <span>PM2.5</span>
                    <strong>{Math.round(currentWeather.pm25_ug_m3)} µg/m³</strong>
                  </div>
                </div>
                <div className="tpp-weather-alerts" role="status">
                  {alerts.map((alert) => <p key={alert}>{alert}</p>)}
                </div>
              </div>
            ) : weatherError ? (
              <p className="tpp-weather-unavailable">{weatherError}</p>
            ) : null}

            {/* Selectores de paradero */}
            <StopPicker
              label="Paradero de subida"
              value={origin}
              stops={stops}
              excludeId={destination?.id}
              onSelect={(s) => { setOrigin(s); setPlans(null); }}
            />
            <StopPicker
              label="Paradero de bajada"
              value={destination}
              stops={stops}
              excludeId={origin?.id}
              onSelect={(s) => { setDestination(s); setPlans(null); }}
            />

            {/* Acciones */}
            <div className="tpp-actions">
              <button
                type="button"
                className="tpp-btn-primary"
                disabled={!canSearch || planning}
                onClick={findRoute}
              >
                {planning ? 'Calculando…' : 'Ver ruta recomendada'}
              </button>
              {(origin || destination || plans) && (
                <button type="button" className="tpp-btn-ghost" onClick={reset}>
                  Limpiar
                </button>
              )}
            </div>

            {/* Error de planificación */}
            {planError && <p className="tpp-error">{planError}</p>}

            {/* Resultados */}
            {plans && plans.length > 0 && (
              <div className="tpp-results">
                <p className="tpp-results-label">
                  {plans.length} recorrido{plans.length !== 1 ? 's' : ''} encontrado{plans.length !== 1 ? 's' : ''}
                </p>
                {activeRouteWeatherAlert && (
                  <p className="tpp-route-weather-alert" role="status">
                    {activeRouteWeatherAlert}
                  </p>
                )}
                {plans.map((plan, idx) => (
                  <button
                    key={`${plan.origin_stop_id}-${plan.destination_stop_id}-${idx}`}
                    type="button"
                    className={`tpp-plan-row${idx === selectedIndex ? ' tpp-plan-active' : ''}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <span className="tpp-plan-badge">
                      {idx === 0 ? '⭐ Recomendada' : `Alternativa ${idx}`}
                    </span>
                    <span className="tpp-plan-time">{formatDuration(plan.total_time_seconds)}</span>
                    <span className="tpp-plan-dist">{formatDistance(plan.total_distance_meters)}</span>
                    {plan.transfers > 0 && (
                      <span className="tpp-plan-transfers">{plan.transfers} transbordo{plan.transfers !== 1 ? 's' : ''}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
