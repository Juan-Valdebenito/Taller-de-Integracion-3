import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LiveMap.css';

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

interface LiveMapProps {
  buses: BusData[];
  onBusClick: (busId: string, lineName: string) => void;
  selectedBusId?: string;
}

// Centro de Temuco
const DEFAULT_CENTER: [number, number] = [-38.7359, -72.5904];

// Helper para crear un icono dinámico con badge de aforo
const createBusIcon = (line: string, passengers: number = 0, capacity: number = 35) => {
  const percentage = capacity > 0 ? (passengers / capacity) * 100 : 0;
  let statusColor = '#22c55e'; // Verde
  if (percentage >= 95 || passengers >= capacity) {
    statusColor = '#ef4444'; // Rojo (Lleno)
  } else if (percentage >= 70) {
    statusColor = '#eab308'; // Amarillo (Medio-Alto)
  }

  const html = `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <div style="
        background: #1e293b;
        color: #ffffff;
        font-weight: 800;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 9999px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        border: 1px solid #475569;
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
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid ${statusColor};
        transition: transform 0.2s ease;
      ">
        🚍
      </div>
    </div>
  `;

  return new L.DivIcon({
    html,
    className: 'custom-bus-icon-container',
    iconSize: [50, 50],
    iconAnchor: [25, 35],
    popupAnchor: [0, -35],
  });
};

export const LiveMap: React.FC<LiveMapProps> = ({ buses, onBusClick }) => {
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
        
        {buses.map((bus) => {
          const pass = bus.currentPassengers ?? 0;
          const cap = bus.capacity ?? 35;
          const icon = createBusIcon(bus.line, pass, cap);

          return (
            <Marker 
              key={bus.id} 
              position={[bus.lat, bus.lng]} 
              icon={icon}
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
                  <p style={{ margin: '2px 0', color: bus.isFull ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {bus.isFull ? '⚠️ BUS COMPLETO (35 Pasajeros)' : '🟢 Asientos Disponibles'}
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
      </MapContainer>
    </div>
  );
};

