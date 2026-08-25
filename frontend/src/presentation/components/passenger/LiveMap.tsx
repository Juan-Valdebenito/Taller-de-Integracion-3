import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

// Custom Bus Icon using HTML and CSS
const busIcon = new L.DivIcon({
  html: '<div class="bus-marker">🚌</div>',
  className: 'custom-bus-icon',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

export interface BusData {
  id: string;
  line: string;
  lat: number;
  lng: number;
  status: string;
}

interface LiveMapProps {
  buses: BusData[];
  onBusClick: (busId: string, lineName: string) => void;
}

// Centro de Temuco
const DEFAULT_CENTER: [number, number] = [-38.7359, -72.5904];

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
        
        {buses.map((bus) => (
          <Marker 
            key={bus.id} 
            position={[bus.lat, bus.lng]} 
            icon={busIcon}
            eventHandlers={{
              click: () => onBusClick(bus.id, bus.line)
            }}
          >
            <Popup>
              <div className="bus-popup">
                <strong>Micro {bus.line}</strong>
                <p>ID: {bus.id}</p>
                <p>Estado: {bus.status}</p>
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
        ))}
      </MapContainer>
    </div>
  );
};
