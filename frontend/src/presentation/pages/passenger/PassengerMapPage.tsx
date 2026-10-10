/**
 * PassengerMapPage.tsx
 *
 * Vista principal del mapa interactivo para pasajeros.
 * Muestra micros en tiempo real sobre un mapa Leaflet centrado en Temuco.
 *
 * Arquitectura de datos:
 *  1. WebSocket nativo Go (/ws) — fuente primaria via useSocketBuses
 *  2. Simulacion local         — fallback cuando WS no esta conectado
 *
 * Componentes:
 *  - MapStatusBar      — barra superior: estado WS, latencia, contadores
 *  - RouteFilter       — filtro de rutas (botones pill)
 *  - RouteNodesLayer   — nodos/paraderos de rutas en el mapa
 *  - BusMarker         — marcador SVG animado de cada micro
 *  - BusSidePanel      — panel lateral con lista de buses
 *  - ConnectionOverlay — overlay de reconexion cuando se pierde el WS
 *  - SimulationDevTools — panel flotante para inyectar eventos de simulacion
 */

import { useCallback, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './PassengerMapPage.css';

import { useSimulatedBuses, type BusState } from '../../../hooks/useSimulatedBuses';
import { useSocketBuses } from '../../../hooks/useSocketBuses';
import { BusMarker } from '../../components/map/BusMarker';
import { BusSidePanel } from '../../components/map/BusSidePanel';
import { RouteFilter } from '../../components/map/RouteFilter';
import { MapStatusBar } from '../../components/map/MapStatusBar';
import { ConnectionOverlay } from '../../components/map/ConnectionOverlay';
import { RouteNodesLayer } from '../../components/map/RouteNodesLayer';
import { SimulationDevTools } from '../../components/passenger/SimulationDevTools';

// Centro del mapa: Plaza de Armas de Temuco
const TEMUCO_CENTER: [number, number] = [-38.7359, -72.5904];
const DEFAULT_ZOOM = 14;

// Tipos de eventos de simulacion local (espeja SimulationDevTools)
type SimEventType =
  | 'tap_in_normal'
  | 'tap_in_student'
  | 'sensor_alight'
  | 'fill_capacity'
  | 'empty_capacity';

export function PassengerMapPage() {
  // Estado de seleccion y filtro
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');

  // Buses simulados: fuente de datos local (fallback)
  const simulatedBuses = useSimulatedBuses(2000);

  // Estado de buses: empieza con simulados, se sobreescribe con datos WS
  const [buses, setBuses] = useState<BusState[]>(simulatedBuses);

  // Callback estable para que useSocketBuses actualice el estado de buses
  const setBusesCallback = useCallback(
    (updater: (prev: BusState[]) => BusState[]) => {
      setBuses(updater);
    },
    [],
  );

  // WebSocket nativo Go: fuente primaria de datos
  const wsState = useSocketBuses(setBusesCallback, true);

  // Si el WS esta conectado, usar buses del WS; si no, usar simulacion local
  const activeBuses = wsState.status === 'connected' ? buses : simulatedBuses;
  const isInitialLoading = wsState.status === 'connecting' && wsState.totalMessages === 0;

  // Filtro de ruta
  const visibleBuses =
    routeFilter === 'all'
      ? activeBuses
      : activeBuses.filter((b) => b.routeId === routeFilter);

  // Handler de seleccion de bus (toggle)
  const handleSelectBus = (id: string) => {
    setSelectedBusId((prev) => (prev === id ? null : id));
  };

  /**
   * Handler para eventos de simulacion LOCAL (cuando no hay WS ni REST).
   * Aplica el delta directamente sobre el estado de buses del mapa.
   */
  const handleLocalSimEvent = useCallback(
    (busId: string, eventType: SimEventType) => {
      setBuses((prev) =>
        prev.map((b) => {
          if (b.id !== busId) return b;

          const cap = b.capacity;
          let pass = b.currentPassengers;
          let boardings = b.boardings ?? 0;
          let alightings = b.alightings ?? 0;
          let studentBoardings = b.studentBoardings ?? 0;

          switch (eventType) {
            case 'tap_in_normal':
              pass = Math.min(cap, pass + 1);
              boardings += 1;
              break;
            case 'tap_in_student':
              pass = Math.min(cap, pass + 1);
              boardings += 1;
              studentBoardings += 1;
              break;
            case 'sensor_alight':
              pass = Math.max(0, pass - 1);
              alightings += 1;
              break;
            case 'fill_capacity':
              pass = cap;
              break;
            case 'empty_capacity':
              pass = 0;
              break;
          }

          return {
            ...b,
            currentPassengers: pass,
            boardings,
            alightings,
            studentBoardings,
            lastUpdate: new Date(),
          };
        }),
      );
    },
    [],
  );

  return (
    <div className="map-page">
      {/* Barra de estado superior: conexion WS, latencia, contadores */}
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
          <MapContainer
            center={TEMUCO_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            {/* Tiles OpenStreetMap con tema oscuro via CSS */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            {/* Capa de paraderos de ruta */}
            <RouteNodesLayer routeFilter={routeFilter} />

            {/* Marcadores de micros animados */}
            {visibleBuses.map((bus) => (
              <BusMarker
                key={bus.id}
                bus={bus}
                isSelected={bus.id === selectedBusId}
                onSelect={handleSelectBus}
              />
            ))}
          </MapContainer>

          {/* Overlay de reconexion (solo aparece si ya estuvo conectado) */}
          <ConnectionOverlay status={wsState.status} />

          {/* Panel flotante de simulacion: inyecta eventos via WS nativo */}
          <SimulationDevTools
            buses={activeBuses}
            selectedBusId={selectedBusId}
            onSelectBus={handleSelectBus}
            wsStatus={wsState.status}
            onLocalEvent={handleLocalSimEvent}
          />
        </div>

        {/* Panel lateral: lista de buses con ETA y aforo */}
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
