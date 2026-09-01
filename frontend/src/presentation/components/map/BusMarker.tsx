/**
 * BusMarker.tsx
 *
 * Marcador SVG custom para Leaflet que muestra el ícono de micro
 * con color según nivel de ocupación y rotación según heading.
 */

import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { BusState, getOccupancyColor, getOccupancyLevel } from '../../../hooks/useSimulatedBuses';

interface BusMarkerProps {
  bus: BusState;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** Genera un divIcon SVG con el color de ocupación y la rotación del heading */
function createBusIcon(color: string, heading: number, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 42 : 34;
  const pulse = isSelected
    ? `<circle cx="17" cy="17" r="18" fill="${color}" opacity="0.2">
        <animate attributeName="r" from="18" to="26" dur="1.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.2" to="0" dur="1.2s" repeatCount="indefinite"/>
       </circle>`
    : '';

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg"
         style="transform: rotate(${heading}deg); transform-origin: center; transition: transform 0.5s ease;">
      ${pulse}
      <circle cx="17" cy="17" r="16" fill="${color}" opacity="0.25"/>
      <circle cx="17" cy="17" r="13" fill="${color}"/>
      <text x="17" y="22" text-anchor="middle" font-size="14" font-family="system-ui">🚌</text>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

/** Barra de ocupación visual */
function OccupancyBar({ current, capacity }: { current: number; capacity: number }) {
  const pct = Math.round((current / capacity) * 100);
  const level = getOccupancyLevel(current, capacity);
  const color = getOccupancyColor(level);

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px', color: '#aaa' }}>
        <span>Ocupación</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '4px',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
        {current} / {capacity} pasajeros
      </div>
    </div>
  );
}

/** Etiqueta de estado */
const STATUS_CONFIG: Record<BusState['status'], { label: string; color: string }> = {
  ACTIVE:  { label: 'En ruta',   color: '#22c55e' },
  STOPPED: { label: 'Detenido',  color: '#f59e0b' },
  DELAYED: { label: 'Retrasado', color: '#ef4444' },
};

function StatusBadge({ status }: { status: BusState['status'] }) {
  const config = STATUS_CONFIG[status];

  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: '9999px',
      background: `${config.color}22`,
      color: config.color,
      border: `1px solid ${config.color}44`,
      fontSize: '10px',
      fontWeight: 700,
    }}>
      {config.label}
    </span>
  );
}

export function BusMarker({ bus, isSelected, onSelect }: BusMarkerProps) {
  const level = getOccupancyLevel(bus.currentPassengers, bus.capacity);
  const color = getOccupancyColor(level);

  const icon = useMemo(
    () => createBusIcon(color, bus.heading, isSelected),
    [color, bus.heading, isSelected],
  );

  const etaMinutes = Math.floor(Math.random() * 8) + 1; // ETA simulado

  return (
    <Marker
      position={[bus.latitude, bus.longitude]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(bus.id) }}
    >
      <Popup
        closeButton={false}
        className="bus-popup"
        maxWidth={220}
      >
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          minWidth: '200px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🚌</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>{bus.id}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{bus.routeName}</div>
            </div>
          </div>

          <StatusBadge status={bus.status} />

          <OccupancyBar current={bus.currentPassengers} capacity={bus.capacity} />

          {/* Datos extra */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Velocidad</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                {Math.round(bus.speed)} km/h
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>ETA próx.</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                ~{etaMinutes} min
              </div>
            </div>
          </div>

          <div style={{ fontSize: '10px', color: '#475569', marginTop: '6px', textAlign: 'right' }}>
            Act. {bus.lastUpdate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
