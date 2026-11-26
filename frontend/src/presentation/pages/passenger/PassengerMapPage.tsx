/**
 * PassengerMapPage.tsx
 *
 * Vista principal del mapa interactivo para pasajeros.
 * Muestra micros en tiempo real sobre un mapa Leaflet centrado en Temuco.
 *
 * Features:
 *  - WebSocket como fuente primaria de datos (backend Go)
 *  - Eventos GPS reales del backend con simulación previa como respaldo
 *  - Marcadores SVG con animación de movimiento suave (interpolación rAF)
 *  - Halo de ocupación con color del OccupancyService
 *  - Popup con datos de predicción de aforo del backend
 *  - Panel lateral ordenado por ocupación con badges de predicción
 *  - Barra de estado con latencia WS y mensajes/segundo
 *  - Overlay de reconexión cuando se pierde la conexión
 *  - Herramientas de sensores y pagos en desarrollo
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './PassengerMapPage.css';

import type { BusState } from '../../../hooks/useSimulatedBuses';
import { useSocketBuses } from '../../../hooks/useSocketBuses';
import { BusMarker } from '../../components/map/BusMarker';
import { BusSidePanel } from '../../components/map/BusSidePanel';
import { RouteFilter } from '../../components/map/RouteFilter';
import { MapStatusBar } from '../../components/map/MapStatusBar';
import { ConnectionOverlay } from '../../components/map/ConnectionOverlay';
import { microStopsApi, type MicroStop } from '../../../infrastructure/api/microStopsApi';
import { climateTelemetryApi, type ClimateTelemetryRecord } from '../../../infrastructure/api/climateTelemetryApi';
import { routesApi, type RouteStop } from '../../../infrastructure/api/routesApi';
import { LiveMap } from '../../components/passenger/LiveMap';
import { SimulationDevTools } from '../../components/passenger/SimulationDevTools';
import { RecommendedTripPlanner } from '../../components/passenger/RecommendedTripPlanner';

const NO_BUSES: BusState[] = [];
const SHOW_DEVTOOLS = import.meta.env.DEV;

interface MapRouteOption {
  id: string;
  label: string;
}

const BUS_EVENT_MAX_AGE_MS = 60_000;
const SIMULATION_EVENT_MAX_AGE_MS = 15_000;
const SIMULATION_ROUTES: MapRouteOption[] = [
  { id: 'route-7A', label: 'Línea 7A' },
  { id: 'route-7B', label: 'Línea 7B' },
  { id: 'route-1C', label: 'Línea 1C' },
];

const STOPS_LIMIT = 5000;
const CLIMATE_REFRESH_MS = 10_000;
const CLIMATE_WINDOW_MS = 60 * 60 * 1000;
const CLIMATE_TELEMETRY_LIMIT = 1000;

export function PassengerMapPage() {
  // ── Estado ────────────────────────────────────────────────────
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [routes, setRoutes] = useState<MapRouteOption[]>(SIMULATION_ROUTES);
  const [routeStopsByRoute, setRouteStopsByRoute] = useState<Record<string, RouteStop[]>>({});
  const [routeNames, setRouteNames] = useState<Record<string, string>>({});
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesMessage, setRoutesMessage] = useState<string | null>(null);
  const [stops, setStops] = useState<MicroStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [stopsMessage, setStopsMessage] = useState<string | null>(null);
  const [climateTelemetry, setClimateTelemetry] = useState<ClimateTelemetryRecord[]>([]);
  const [climateLoading, setClimateLoading] = useState(true);
  const [climateMessage, setClimateMessage] = useState<string | null>(null);
  const [freshnessClock, setFreshnessClock] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    routesApi.getAll()
      .then((loadedRoutes) => {
        if (!active) return;

        const activeRoutes = loadedRoutes.filter((route) => route.isActive);
        const names: Record<string, string> = {};
        const mergedRoutes = new Map<string, MapRouteOption>(
          SIMULATION_ROUTES.map((route): [string, MapRouteOption] => [route.id, route]),
        );

        for (const route of activeRoutes) {
          const label = route.name || route.code || `Ruta ${route.id}`;
          mergedRoutes.set(route.id, { id: route.id, label });
          names[route.id] = label;
        }

        const routeOptions = Array.from(mergedRoutes.values());
        setRoutes(routeOptions);
        setRouteNames(names);
        setRoutesMessage(null);
        void Promise.all(activeRoutes.map(async (route) => {
          try {
            return [route.id, await routesApi.getStops(route.id)] as const;
          } catch {
            return [route.id, []] as const;
          }
        })).then((entries) => {
          if (active) setRouteStopsByRoute(Object.fromEntries(entries));
        });
      })
      .catch(() => {
        if (active) setRoutesMessage('No se pudieron cargar las rutas reales; se mantienen las rutas de respaldo.');
      })
      .finally(() => {
        if (active) setRoutesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setFreshnessClock(Date.now()), 5_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let active = true;

    microStopsApi.getAll({ limit: STOPS_LIMIT })
      .then(({ stops: loadedStops, total }) => {
        if (!active) return;
        setStops(loadedStops);
        if (total > loadedStops.length) {
          setStopsMessage(`Se muestran ${loadedStops.length} de ${total} paraderos.`);
        }
      })
      .catch(() => {
        if (active) setStopsMessage('No se pudieron cargar los paraderos.');
      })
      .finally(() => {
        if (active) setStopsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const loadClimateTelemetry = async () => {
      if (inFlight) return;
      inFlight = true;

      const to = new Date();
      const from = new Date(to.getTime() - CLIMATE_WINDOW_MS);

      try {
        const records = await climateTelemetryApi.getAll({
          from: from.toISOString(),
          to: to.toISOString(),
          limit: CLIMATE_TELEMETRY_LIMIT,
        });
        if (!active) return;

        const latestByStation = new Map<string, ClimateTelemetryRecord>();
        for (const record of records) {
          const current = latestByStation.get(record.station_id);
          if (!current || Date.parse(record.time) > Date.parse(current.time)) {
            latestByStation.set(record.station_id, record);
          }
        }

        const latestRecords = Array.from(latestByStation.values());
        setClimateTelemetry(latestRecords);
        setClimateMessage(latestRecords.length === 0 ? 'No se encontraron registros climáticos recientes.' : null);
      } catch {
        if (active) setClimateMessage('No se pudo actualizar la información climática.');
      } finally {
        inFlight = false;
        if (active) setClimateLoading(false);
      }
    };

    void loadClimateTelemetry();
    const intervalId = window.setInterval(() => void loadClimateTelemetry(), CLIMATE_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const [buses, setBuses] = useState<BusState[]>([]);

  // ── WebSocket: rutas reales más rutas de respaldo ────────────
  const setBusesCallback = useCallback(
    (updater: (prev: BusState[]) => BusState[]) => {
      setBuses(updater);
    },
    [],
  );
  const subscribedRouteIds = useMemo(
    () => Array.from(new Set([...SIMULATION_ROUTES.map((route) => route.id), ...routes.map((route) => route.id)])),
    [routes],
  );
  const wsState = useSocketBuses(setBusesCallback, true, subscribedRouteIds);

  // Sin conexión no se muestran micros: su posición ya no sería la actual.
  const sourceBuses = wsState.status === 'connected' ? buses : NO_BUSES;
  const freshBuses = sourceBuses.filter((bus) => {
    if (!bus.lastWsUpdate) return false;
    const maxAge = bus.dataSource === 'live' ? BUS_EVENT_MAX_AGE_MS : SIMULATION_EVENT_MAX_AGE_MS;
    return freshnessClock - bus.lastWsUpdate.getTime() <= maxAge;
  });
  const liveRoutes = new Set(freshBuses.filter((bus) => bus.dataSource === 'live').map((bus) => bus.routeId));
  const activeBuses = freshBuses
    .filter((bus) => bus.dataSource === 'live' || !liveRoutes.has(bus.routeId))
    .map((bus) => ({
      ...bus,
      routeName: routeNames[bus.routeId] || bus.routeName,
    }));
  const isInitialLoading = wsState.status === 'connecting' && wsState.totalMessages === 0;

  // ── Filtro de ruta ────────────────────────────────────────────
  const visibleBuses =
    routeFilter === 'all'
      ? activeBuses
      : activeBuses.filter((b) => b.routeId === routeFilter);

  // ── Handlers ─────────────────────────────────────────────────
  const handleSelectBus = (id: string) => {
    setSelectedBusId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="map-page">
      {/* Barra de estado superior */}
      <MapStatusBar
        buses={activeBuses}
        wsState={wsState}
        routeFilter={routeFilter}
      />

      {/* Barra de filtro de rutas */}
      <div className="map-topbar">
        <span className="map-topbar-label">Ruta:</span>
        <RouteFilter
          buses={activeBuses}
          routes={routes}
          value={routeFilter}
          onChange={setRouteFilter}
        />
      </div>

      {/* Contenido principal: mapa + panel lateral */}
      <div className="map-content">
        {/* Mapa Leaflet */}
        <div className="map-leaflet-wrapper">
          <LiveMap stops={stops} climateTelemetry={climateTelemetry}>
            <RecommendedTripPlanner />

            {/* Marcadores de micros con animación */}
            {visibleBuses.map((bus) => (
              <BusMarker
                key={bus.id}
                bus={bus}
                isSelected={bus.id === selectedBusId}
                onSelect={handleSelectBus}
                routeStops={routeStopsByRoute[bus.routeId] ?? []}
              />
            ))}
          </LiveMap>

          {stopsLoading || stopsMessage ? (
            <div className="map-stops-notice" role="status" aria-live="polite">
              {stopsLoading ? 'Cargando paraderos...' : stopsMessage}
            </div>
          ) : null}

          {routesLoading || routesMessage ? (
            <div className="map-stops-notice" role="status" aria-live="polite">
              {routesLoading ? 'Cargando rutas reales...' : routesMessage}
            </div>
          ) : null}

          {climateLoading || climateMessage ? (
            <div className="map-climate-notice" role="status" aria-live="polite">
              {climateLoading && climateTelemetry.length === 0 ? 'Cargando información climática...' : climateMessage}
            </div>
          ) : null}

          {/* Overlay de conexión */}
          <ConnectionOverlay status={wsState.status} />

          {SHOW_DEVTOOLS && activeBuses.length > 0 ? (
            <SimulationDevTools
              buses={activeBuses}
              selectedBusId={selectedBusId}
              onSelectBus={setSelectedBusId}
              wsStatus={wsState.status}
            />
          ) : null}

        </div>

        {/* Panel lateral */}
        <aside className="map-side-panel">
          <BusSidePanel
            buses={activeBuses}
            selectedId={selectedBusId}
            onSelect={handleSelectBus}
            routeFilter={routeFilter}
            loading={isInitialLoading}
            routeStopsByRoute={routeStopsByRoute}
          />
        </aside>
      </div>
    </div>
  );
}
