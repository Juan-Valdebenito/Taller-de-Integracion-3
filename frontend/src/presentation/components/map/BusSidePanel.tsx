/**
 * BusSidePanel.tsx
 *
 * Panel lateral con la lista de micros activas.
 * Muestra ID, ruta, barra de ocupación, velocidad y estado.
 * Al hacer click en una fila, selecciona la micro en el mapa.
 */

import { BusState, getOccupancyColor, getOccupancyLevel } from '../../../hooks/useSimulatedBuses';

interface BusSidePanelProps {
  buses: BusState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  routeFilter: string;
}

function OccupancyDots({ current, capacity }: { current: number; capacity: number }) {
  const pct = current / capacity;
  const filled = Math.round(pct * 5);
  const level = getOccupancyLevel(current, capacity);
  const color = getOccupancyColor(level);

  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: i < filled ? color : 'rgba(255,255,255,0.12)',
            transition: 'background 0.4s ease',
          }}
        />
      ))}
    </div>
  );
}

const STATUS_CONFIG: Record<BusState['status'], { label: string; dot: string }> = {
  ACTIVE:  { label: 'En ruta',   dot: '#22c55e' },
  STOPPED: { label: 'Detenido',  dot: '#f59e0b' },
  DELAYED: { label: 'Retrasado', dot: '#ef4444' },
};

export function BusSidePanel({ buses, selectedId, onSelect, routeFilter }: BusSidePanelProps) {
  const filtered = routeFilter === 'all'
    ? buses
    : buses.filter((b) => b.routeId === routeFilter);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#f1f5f9' }}>
          Micros activas
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          {filtered.length} en pantalla · click para centrar
        </div>
      </div>

      {/* Lista scrolleable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {filtered.map((bus) => {
          const isSelected = bus.id === selectedId;
          const pct = Math.round((bus.currentPassengers / bus.capacity) * 100);
          const status = STATUS_CONFIG[bus.status];
          const occColor = getOccupancyColor(getOccupancyLevel(bus.currentPassengers, bus.capacity));

          return (
            <button
              key={bus.id}
              onClick={() => onSelect(bus.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: isSelected
                  ? 'rgba(59, 130, 246, 0.12)'
                  : 'transparent',
                border: 'none',
                borderLeft: isSelected
                  ? '3px solid hsl(215,80%,55%)'
                  : '3px solid transparent',
                padding: '10px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }
              }}
            >
              {/* Fila superior: ID + estado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>🚌</span>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#f1f5f9' }}>{bus.id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: status.dot,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>{status.label}</span>
                </div>
              </div>

              {/* Nombre de ruta */}
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bus.routeName}
              </div>

              {/* Ocupación: puntos + % */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <OccupancyDots current={bus.currentPassengers} capacity={bus.capacity} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: occColor }}>
                  {pct}% · {Math.round(bus.speed)} km/h
                </span>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: '#475569', fontSize: '12px' }}>
            No hay micros en esta ruta
          </div>
        )}
      </div>
    </div>
  );
}
