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
 */

import { useCallback, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './PassengerMapPage.css';

import { useSimulatedBuses, BusState } from '../../../hooks/useSimulatedBuses';
import { useSocketBuses } from '../../../hooks/useSocketBuses';
import { BusMarker } from '../../components/map/BusMarker';
import { BusSidePanel } from '../../components/map/BusSidePanel';
import { RouteFilter } from '../../components/map/RouteFilter';
import { MapStatusBar } from '../../components/map/MapStatusBar';
import { ConnectionOverlay } from '../../components/map/ConnectionOverlay';
import { RouteNodesLayer } from '../../components/map/RouteNodesLayer';

// Centro del mapa: Plaza de Armas de Temuco
const TEMUCO_CENTER: [number, number] = [-38.7359, -72.5904];
const DEFAULT_ZOOM = 14;

export function PassengerMapPage() {
  // ── Estado ────────────────────────────────────────────────────
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');

  // ── Buses simulados (fallback cuando WS no está conectado) ────
  const simulatedBuses = useSimulatedBuses(2000);
  const [buses, setBuses] = useState<BusState[]>(simulatedBuses);

  // Sincronizar estado local con la simulación
  useState(() => {
    setBuses(simulatedBuses);
  });

  // ── WebSocket (fuente primaria) ────────────────────────────────
  const setBusesCallback = useCallback(
    (updater: (prev: BusState[]) => BusState[]) => {
      setBuses(updater);
    },
    [],
  );
  const wsState = useSocketBuses(setBusesCallback, true);

  // WebSocket es la fuente primaria; simulación es fallback
  const activeBuses = wsState.status === 'connected' ? buses : simulatedBuses;
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
            {/* Tiles de OpenStreetMap */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            <RouteNodesLayer routeFilter={routeFilter} />

            {/* Marcadores de micros con animación */}
            {visibleBuses.map((bus) => (
              <BusMarker
                key={bus.id}
                bus={bus}
                isSelected={bus.id === selectedBusId}
                onSelect={handleSelectBus}
              />
            ))}
          </MapContainer>

          {/* Overlay de conexión */}
          <ConnectionOverlay status={wsState.status} />
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
