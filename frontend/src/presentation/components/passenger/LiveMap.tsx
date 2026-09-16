import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';
import { HazardMarker } from './HazardMarker';

// Fix for default Leaflet icon paths in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export interface BusData {
  id: string;
  line: string;
  lat: number;
  lng: number;
  status: string;
  capacity?: number;
  currentPassengers?: number;
  occupancyPercentage?: number;
  boardings?: number;
  schoolBoardings?: number;
  alightings?: number;
  isFull?: boolean;
  lastEvent?: {
    type: string;
    description: string;
    timestamp: string;
  };
}

export interface HazardData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  createdAt: string;
  usefulVotes: number;
}

interface LiveMapProps {
  buses: BusData[];
  hazards: HazardData[];
  onBusClick: (busId: string, lineName: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onHazardUseful: (id: string) => boolean;
  onHazardResolve: (id: string) => void;
  selectedBusId?: string;
}

// Centro de Temuco
const DEFAULT_CENTER: [number, number] = [-38.7359, -72.5904];

// Helper para crear un icono dinámico con badge de aforo sincronizado
const createBusIcon = (
  line: string,
  passengers: number = 0,
  capacity: number = 35,
  isFull: boolean = false,
  isSelected: boolean = false
) => {
  const percentage = capacity > 0 ? (passengers / capacity) * 100 : 0;
  const isOvercrowded = isFull || passengers >= capacity;

  // Umbrales requeridos:
  // Verde: < 60%
  // Amarillo: 60% - 89%
  // Rojo crítico: >= 90%
  let statusColor = '#22c55e'; // Verde (< 60%)
  if (percentage >= 90 || isOvercrowded) {
    statusColor = '#ef4444'; // Rojo crítico (>= 90%)
  } else if (percentage >= 60) {
    statusColor = '#eab308'; // Amarillo (60% - 89%)
  }

  const fullBadgeHtml = isOvercrowded
    ? `<div style="
        background: #dc2626;
        color: #ffffff;
        font-weight: 900;
        font-size: 8px;
        padding: 2px 6px;
        border-radius: 9999px;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.7);
        border: 1px solid #fca5a5;
        margin-bottom: 2px;
        white-space: nowrap;
        text-transform: uppercase;
      ">⚠️ LLENO / ALERTA DE SOBRECUPO</div>`
    : '';

  const selectedRingStyle = isSelected
    ? `box-shadow: 0 0 0 3px #38bdf8, 0 0 14px rgba(56, 189, 248, 0.7); transform: scale(1.1);`
    : `box-shadow: 0 4px 10px rgba(0,0,0,0.35);`;

  const html = `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      z-index: ${isSelected ? 50 : 10};
    ">
      ${fullBadgeHtml}
      <div style="
        background: #1e293b;
        color: #ffffff;
        font-weight: 800;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 9999px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        border: 1px solid ${isSelected ? '#38bdf8' : '#475569'};
        margin-bottom: -4px;
        z-index: 2;
        white-space: nowrap;
      ">
        ${line} • ${passengers}/${capacity}
      </div>
      <div style="
        font-size: 24px;
        width: 38px;
        height: 38px;
        background-color: #ffffff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid ${statusColor};
        ${selectedRingStyle}
        transition: all 0.2s ease;
      ">
        🚍
      </div>
    </div>
  `;

  return new L.DivIcon({
    html,
    className: 'custom-bus-icon-container',
    iconSize: [60, 60],
    iconAnchor: [30, 42],
    popupAnchor: [0, -42],
  });
};

export const LiveMap: React.FC<LiveMapProps> = ({
  buses,
  hazards,
  onBusClick,
  onMapClick,
  onHazardUseful,
  onHazardResolve,
  selectedBusId,
}) => {
  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  return (
    <div className="live-map-container">
      <MapContainer 
        center={DEFAULT_CENTER} 
        zoom={14} 
        scrollWheelZoom={true} 
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapClickHandler />
        
        {buses.map((bus) => {
          const pass = bus.currentPassengers ?? 0;
          const cap = bus.capacity ?? 35;
          const isFull = Boolean(bus.isFull || pass >= cap);
          const isSelected = bus.id === selectedBusId;
          const icon = createBusIcon(bus.line, pass, cap, isFull, isSelected);

          return (
            <Marker 
              key={bus.id} 
              position={[bus.lat, bus.lng]} 
              icon={icon}
              bubblingMouseEvents={false}
              eventHandlers={{
                click: () => onBusClick(bus.id, bus.line)
              }}
            >
              <Popup>
                <div className="bus-popup">
                  <strong>Micro Línea {bus.line}</strong>
                  <p style={{ margin: '2px 0' }}>ID: <code>{bus.id}</code></p>
                  <p style={{ margin: '2px 0', fontWeight: 'bold' }}>
                    Aforo: {pass} / {cap} ({bus.occupancyPercentage ?? Math.round((pass/cap)*100)}%)
                  </p>
                  <p style={{ margin: '2px 0', color: isFull ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {isFull ? '⚠️ LLENO / ALERTA DE SOBRECUPO' : '🟢 Asientos Disponibles'}
                  </p>
                  {bus.lastEvent && (
                    <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', margin: '4px 0' }}>
                      {bus.lastEvent.description}
                    </p>
                  )}
                  <button 
                    className="popup-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBusClick(bus.id, bus.line);
                    }}
                  >
                    Dejar Reclamo
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {hazards.map((hazard) => (
          <HazardMarker
            key={hazard.id}
            hazard={hazard}
            onUseful={onHazardUseful}
            onResolve={onHazardResolve}
          />
        ))}
      </MapContainer>
    </div>
  );
};

