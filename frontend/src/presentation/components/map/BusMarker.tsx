/**
 * BusMarker.tsx
 *
 * Marcador SVG premium para Leaflet que muestra el ícono de micro
 * con animación de movimiento suave, halo de ocupación con gradiente,
 * y popup enriquecido con datos de predicción del WebSocket.
 */

import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { BusState, getOccupancyColor, getOccupancyLevel } from '../../../hooks/useSimulatedBuses';
import { useAnimatedPosition } from '../../../hooks/useAnimatedPosition';

interface BusMarkerProps {
  bus: BusState;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** Genera un divIcon SVG premium con halo de ocupación y flecha de dirección */
function createBusIcon(color: string, heading: number, isSelected: boolean, isRecent: boolean): L.DivIcon {
  const size = isSelected ? 46 : 36;
  const half = size / 2;

  // Halo pulsante para bus seleccionado
  const pulse = isSelected
    ? `<circle cx="${half}" cy="${half}" r="${half - 2}" fill="none" stroke="${color}" stroke-width="2" opacity="0.3">
        <animate attributeName="r" from="${half - 2}" to="${half + 8}" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.3" to="0" dur="1.6s" repeatCount="indefinite"/>
       </circle>`
    : '';

  // Glow para update reciente
  const glow = isRecent
    ? `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="${color}" opacity="0.12">
        <animate attributeName="opacity" from="0.2" to="0.05" dur="2s" repeatCount="1" fill="freeze"/>
       </circle>`
    : '';

  // Flecha de dirección (chevron apuntando hacia arriba, rotado por heading)
  const arrowSize = isSelected ? 6 : 5;
  const arrowY = half - (isSelected ? 16 : 12);

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      ${glow}
      <!-- Halo exterior de ocupación -->
      <circle cx="${half}" cy="${half}" r="${half - 3}" fill="${color}" opacity="0.18"/>
      <!-- Cuerpo principal -->
      <circle cx="${half}" cy="${half}" r="${half - 7}" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
      <!-- Flecha de dirección (rotada por heading) -->
      <g transform="rotate(${heading}, ${half}, ${half})">
        <polygon points="${half},${arrowY} ${half - arrowSize},${arrowY + arrowSize + 2} ${half + arrowSize},${arrowY + arrowSize + 2}"
          fill="rgba(255,255,255,0.9)" stroke="none"/>
      </g>
      <!-- Emoji bus -->
      <text x="${half}" y="${half + 5}" text-anchor="middle" font-size="${isSelected ? 16 : 13}" font-family="system-ui">🚌</text>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: 'bus-marker-icon',
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -(half + 4)],
  });
}

/** Barra de ocupación visual */
function OccupancyBar({ current, capacity, color }: { current: number; capacity: number; color: string }) {
  const pct = Math.round((current / capacity) * 100);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', color: '#94a3b8' }}>
        <span>Ocupación actual</span>
        <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          borderRadius: '6px',
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
        {current} / {capacity} pasajeros
      </div>
    </div>
  );
}

/** Badge de predicción del OccupancyService */
function PredictionBadge({ occupancy }: { occupancy: NonNullable<BusState['wsOccupancy']> }) {
  const predPct = Math.round(occupancy.predictedRatio * 100);
  const confPct = Math.round(occupancy.confidence * 100);

  const levelColors: Record<string, { bg: string; border: string; text: string }> = {
    LOW: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', text: '#4ade80' },
    MEDIUM: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
    HIGH: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
    FULL: { bg: 'rgba(127,29,29,0.1)', border: 'rgba(127,29,29,0.2)', text: '#fca5a5' },
  };

  const colors = levelColors[occupancy.occupancyLevel] || levelColors.LOW;

  return (
    <div style={{
      marginTop: '10px',
      padding: '8px 10px',
      borderRadius: '10px',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ fontSize: '11px', color: colors.text, fontWeight: 600 }}>
        📊 Predicción: <strong>{predPct}%</strong>
      </div>
      <div style={{ fontSize: '10px', color: '#64748b' }}>
        ±{confPct}% · {occupancy.predictorName}
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
      padding: '2px 8px',
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

/** Indicador de frescura del dato */
function FreshnessDot({ lastWsUpdate }: { lastWsUpdate?: Date }) {
  if (!lastWsUpdate) {
    return (
      <span style={{ fontSize: '10px', color: '#475569' }}>
        Simulación
      </span>
    );
  }

  const ageMs = Date.now() - lastWsUpdate.getTime();
  const ageSec = Math.round(ageMs / 1000);
  const color = ageSec < 5 ? '#22c55e' : ageSec < 15 ? '#f59e0b' : '#ef4444';

  return (
    <span style={{ fontSize: '10px', color, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: color, display: 'inline-block',
      }} />
      hace {ageSec}s
    </span>
  );
}

export function BusMarker({ bus, isSelected, onSelect }: BusMarkerProps) {
  // Animación de posición suave
  const animated = useAnimatedPosition(bus.latitude, bus.longitude, bus.heading);

  const level = getOccupancyLevel(bus.currentPassengers, bus.capacity);
  const color = bus.wsOccupancy?.occupancyColor || getOccupancyColor(level);

  // ¿Recibió update del WS hace menos de 3s?
  const isRecent = bus.lastWsUpdate
    ? (Date.now() - bus.lastWsUpdate.getTime()) < 3000
    : false;

  const icon = useMemo(
    () => createBusIcon(color, bus.heading, isSelected, isRecent),
    [bus.heading, color, isSelected, isRecent],
  );

  return (
    <Marker
      position={[animated.lat, animated.lng]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(bus.id) }}
    >
      <Popup
        closeButton={false}
        className="bus-popup"
        maxWidth={240}
      >
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          minWidth: '210px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🚌</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>{bus.id}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{bus.routeName}</div>
              </div>
            </div>
            <FreshnessDot lastWsUpdate={bus.lastWsUpdate} />
          </div>

          <StatusBadge status={bus.status} />

          <OccupancyBar current={bus.currentPassengers} capacity={bus.capacity} color={color} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
            <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: '8px', padding: '7px 9px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Subidas</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>
                {bus.totalBoardings ?? 0}
              </div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '8px', padding: '7px 9px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Bajadas</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24' }}>
                {bus.totalAlightings ?? 0}
              </div>
            </div>
          </div>

          {/* Predicción del WS */}
          {bus.wsOccupancy && (
            <PredictionBadge occupancy={bus.wsOccupancy} />
          )}

          {/* Datos extra */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '10px' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '7px 9px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Velocidad</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(bus.speed)} km/h
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '7px 9px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Dirección</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(bus.heading)}°
              </div>
            </div>
          </div>

          <div style={{ fontSize: '10px', color: '#475569', marginTop: '8px', textAlign: 'right' }}>
            Act. {bus.lastUpdate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
