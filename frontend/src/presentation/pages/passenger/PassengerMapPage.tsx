/**
 * PassengerMapPage.tsx
 *
 * Vista principal del mapa interactivo para pasajeros.
 * Muestra micros en tiempo real sobre un mapa Leaflet centrado en Temuco.
 *
 * Features:
 *  - WebSocket como fuente primaria de datos (backend Go)
 *  - Simulación local como fallback cuando el WS no está conectado
 *  - Marcadores SVG con animación de movimiento suave (interpolación rAF)
 *  - Halo de ocupación con color del OccupancyService
 *  - Popup con datos de predicción de aforo del backend
 *  - Panel lateral ordenado por ocupación con badges de predicción
 *  - Barra de estado con latencia WS y mensajes/segundo
 *  - Overlay de reconexión cuando se pierde la conexión
 *  - Panel de simulación de sensores y pagos (solo en desarrollo), que publica
 *    por el WebSocket nativo /ws de Go
 */

import { useCallback, useEffect, useState } from 'react';
import './PassengerMapPage.css';

import { useSimulatedBuses, BusState } from '../../../hooks/useSimulatedBuses';
import { useSocketBuses } from '../../../hooks/useSocketBuses';
import { BusMarker } from '../../components/map/BusMarker';
import { BusSidePanel } from '../../components/map/BusSidePanel';
import { RouteFilter } from '../../components/map/RouteFilter';
import { MapStatusBar } from '../../components/map/MapStatusBar';
import { ConnectionOverlay } from '../../components/map/ConnectionOverlay';
import { microStopsApi, type MicroStop } from '../../../infrastructure/api/microStopsApi';
import { LiveMap } from '../../components/passenger/LiveMap';
import { SimulationDevTools, type SimEventType } from '../../components/passenger/SimulationDevTools';

// El simulador es una herramienta de desarrollo: no se muestra en producción.
const SHOW_DEVTOOLS = import.meta.env.DEV;

/** Pasajeros de una micro después de un evento simulado (sin salirse de 0..capacidad). */
function passengersAfter(bus: BusState, event: SimEventType): number {
  switch (event) {
    case 'tap_in_normal':
    case 'tap_in_student':
      return Math.min(bus.capacity, bus.currentPassengers + 1);
    case 'sensor_alight':
      return Math.max(0, bus.currentPassengers - 1);
    case 'fill_capacity':
      return bus.capacity;
    case 'empty_capacity':
      return 0;
  }
}

const STOPS_LIMIT = 5000;

export function PassengerMapPage() {
  // ── Estado ────────────────────────────────────────────────────
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [stops, setStops] = useState<MicroStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [stopsMessage, setStopsMessage] = useState<string | null>(null);

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

  // ── Buses simulados (fallback cuando WS no está conectado) ────
  const simulatedBuses = useSimulatedBuses(2000);
  const [buses, setBuses] = useState<BusState[]>([]);

  // ── WebSocket (fuente primaria) ────────────────────────────────
  const setBusesCallback = useCallback(
    (updater: (prev: BusState[]) => BusState[]) => {
      setBuses(updater);
    },
    [],
  );
  const wsState = useSocketBuses(setBusesCallback, true);

  // Eventos del simulador aplicados solo en este mapa (sin servidor, o si lo
  // rechaza). Duran hasta que llega un dato nuevo de esa micro (base distinta).
  const [localPassengers, setLocalPassengers] = useState<Record<string, { base: number; value: number }>>({});

  // WebSocket es la fuente primaria; simulación es fallback
  const sourceBuses = wsState.status === 'connected' && wsState.totalMessages > 0 ? buses : simulatedBuses;
  const activeBuses = sourceBuses.map((bus) => {
    const local = localPassengers[bus.id];
    return local && local.base === bus.currentPassengers ? { ...bus, currentPassengers: local.value } : bus;
  });
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

  const handleLocalEvent = (busId: string, event: SimEventType) => {
    const source = sourceBuses.find((b) => b.id === busId);
    const shown = activeBuses.find((b) => b.id === busId);
    if (source && shown) {
      setLocalPassengers((prev) => ({ ...prev, [busId]: { base: source.currentPassengers, value: passengersAfter(shown, event) } }));
    }
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
          value={routeFilter}
          onChange={setRouteFilter}
        />
      </div>

      {/* Contenido principal: mapa + panel lateral */}
      <div className="map-content">
        {/* Mapa Leaflet */}
        <div className="map-leaflet-wrapper">
          <LiveMap stops={stops}>
            {/* Marcadores de micros con animación */}
            {visibleBuses.map((bus) => (
              <BusMarker
                key={bus.id}
                bus={bus}
                isSelected={bus.id === selectedBusId}
                onSelect={handleSelectBus}
              />
            ))}
          </LiveMap>

          {stopsLoading || stopsMessage ? (
            <div className="map-stops-notice" role="status" aria-live="polite">
              {stopsLoading ? 'Cargando paraderos...' : stopsMessage}
            </div>
          ) : null}

          {/* Overlay de conexión */}
          <ConnectionOverlay status={wsState.status} />

          {SHOW_DEVTOOLS && activeBuses.length > 0 ? (
            <SimulationDevTools
              buses={activeBuses}
              selectedBusId={selectedBusId}
              onSelectBus={(id) => setSelectedBusId(id)}
              wsStatus={wsState.status}
              onLocalEvent={handleLocalEvent}
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
          />
        </aside>
      </div>
    </div>
  );
}
