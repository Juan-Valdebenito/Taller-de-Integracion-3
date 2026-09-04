/**
 * PassengerMapPage.tsx
 *
 * Vista principal del mapa interactivo para pasajeros.
 * Muestra micros simuladas en tiempo real sobre un mapa de Leaflet
 * centrado en Temuco, Chile.
 *
 * Features:
 *  - 5 micros simuladas moviéndose por coordenadas reales de Temuco
 *  - Marcadores SVG con color según nivel de ocupación
 *  - Panel lateral con lista de micros activas
 *  - Selector de ruta (filtro)
 *  - Barra de estado con modo simulación / tiempo real
 *  - Popup al hacer click con datos detallados
 *  - Se integra automáticamente con Socket.io si el backend está corriendo
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

// Centro del mapa: Plaza de Armas de Temuco
const TEMUCO_CENTER: [number, number] = [-38.7359, -72.5904];
const DEFAULT_ZOOM = 14;

export function PassengerMapPage() {
  // ── Estado ────────────────────────────────────────────────────
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');

  // ── Buses simulados (fuente principal) ────────────────────────
  const simulatedBuses = useSimulatedBuses(2000);
  const [buses, setBuses] = useState<BusState[]>(simulatedBuses);

  // Sincronizar estado local con la simulación
  // (useSocketBuses puede sobrescribir posiciones individuales)
  useState(() => {
    setBuses(simulatedBuses);
  });

  // ── Socket.io (override opcional cuando el backend está activo) ─
  const setBusesCallback = useCallback(
    (updater: (prev: BusState[]) => BusState[]) => {
      setBuses(updater);
    },
    [],
  );
  const isSocketConnected = useSocketBuses(setBusesCallback, true);

  // Usar buses simulados actualizados cuando el socket no está conectado
  const activeBuses = isSocketConnected ? buses : simulatedBuses;

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
        isSocketConnected={isSocketConnected}
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
            {/* Tiles de OpenStreetMap — sin API key */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            {/* Marcadores de micros */}
            {visibleBuses.map((bus) => (
              <BusMarker
                key={bus.id}
                bus={bus}
                isSelected={bus.id === selectedBusId}
                onSelect={handleSelectBus}
              />
            ))}
          </MapContainer>
        </div>

        {/* Panel lateral */}
        <aside className="map-side-panel">
          <BusSidePanel
            buses={activeBuses}
            selectedId={selectedBusId}
            onSelect={handleSelectBus}
            routeFilter={routeFilter}
          />
        </aside>
      </div>
    </div>
  );
}
