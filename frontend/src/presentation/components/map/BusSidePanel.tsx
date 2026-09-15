/**
 * BusSidePanel.tsx
 *
 * Panel lateral premium con la lista de micros activas.
 * Ordenado por ocupación (más lleno primero), con badges de predicción,
 * indicador de frescura del dato y micro-animación de flash al recibir updates.
 */

import { useRef, useEffect } from 'react';
import { BusState, getOccupancyColor, getOccupancyLevel } from '../../../hooks/useSimulatedBuses';

interface BusSidePanelProps {
  buses: BusState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  routeFilter: string;
}

/** Barra de ocupación compacta con gradiente */
function MiniOccupancyBar({ current, capacity }: { current: number; capacity: number }) {
  const pct = (current / capacity) * 100;
  const level = getOccupancyLevel(current, capacity);
  const color = getOccupancyColor(level);

  return (
    <div style={{
      width: '100%',
      height: '4px',
      background: 'rgba(255,255,255,0.06)',
      borderRadius: '9999px',
      overflow: 'hidden',
      marginTop: '6px',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${color}cc, ${color})`,
        borderRadius: '9999px',
        transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
      }} />
    </div>
  );
}

/** Dot de frescura */
function FreshDot({ lastWsUpdate }: { lastWsUpdate?: Date }) {
  if (!lastWsUpdate) {
    return <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#475569', display: 'inline-block' }} />;
  }
  const ageSec = Math.round((Date.now() - lastWsUpdate.getTime()) / 1000);
  const color = ageSec < 5 ? '#22c55e' : ageSec < 15 ? '#f59e0b' : '#ef4444';
  return <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, display: 'inline-block' }} />;
}

const STATUS_CONFIG: Record<BusState['status'], { label: string; dot: string }> = {
  ACTIVE:  { label: 'En ruta',   dot: '#22c55e' },
  STOPPED: { label: 'Detenido',  dot: '#f59e0b' },
  DELAYED: { label: 'Retrasado', dot: '#ef4444' },
};

/** Componente individual de fila del bus con flash animation */
function BusRow({ bus, isSelected, onSelect }: {
  bus: BusState;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const lastUpdateRef = useRef<number>(0);

  // Flash animation cuando llega un WS update
  useEffect(() => {
    if (bus.lastWsUpdate) {
      const time = bus.lastWsUpdate.getTime();
      if (time !== lastUpdateRef.current) {
        lastUpdateRef.current = time;
        const el = rowRef.current;
        if (el) {
          el.classList.remove('bus-row-flash');
          void el.offsetWidth; // Force reflow
          el.classList.add('bus-row-flash');
        }
      }
    }
  }, [bus.lastWsUpdate]);

  const pct = Math.round((bus.currentPassengers / bus.capacity) * 100);
  const status = STATUS_CONFIG[bus.status];
  const level = getOccupancyLevel(bus.currentPassengers, bus.capacity);
  const occColor = bus.wsOccupancy?.occupancyColor || getOccupancyColor(level);

  return (
    <button
      ref={rowRef}
      onClick={() => onSelect(bus.id)}
      className="bus-side-row"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isSelected
          ? 'rgba(99, 102, 241, 0.12)'
          : 'transparent',
        border: 'none',
        borderLeft: isSelected
          ? '3px solid #818cf8'
          : '3px solid transparent',
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
        color: 'inherit',
      }}
    >
      {/* Fila superior: ID + frescura + estado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>🚌</span>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f1f5f9' }}>{bus.id}</span>
          <FreshDot lastWsUpdate={bus.lastWsUpdate} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: status.dot, flexShrink: 0,
          }} />
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{status.label}</span>
        </div>
      </div>

      {/* Nombre de ruta */}
      <div style={{
        fontSize: '11px', color: '#64748b', marginBottom: '4px',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {bus.routeName}
      </div>

      {/* Ocupación: porcentaje + velocidad */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: occColor, fontVariantNumeric: 'tabular-nums' }}>
          {pct}% ocupado
        </span>
        <span style={{ fontSize: '10px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(bus.speed)} km/h
        </span>
      </div>

      {/* Mini barra de ocupación */}
      <MiniOccupancyBar current={bus.currentPassengers} capacity={bus.capacity} />

      {/* Badge de predicción del WS */}
      {bus.wsOccupancy && (
        <div style={{
          marginTop: '6px',
          padding: '3px 8px',
          borderRadius: '6px',
          background: `${occColor}15`,
          border: `1px solid ${occColor}25`,
          fontSize: '10px',
          color: occColor,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>📊 Pred: {Math.round(bus.wsOccupancy.predictedRatio * 100)}%</span>
          <span style={{ color: '#64748b' }}>{bus.wsOccupancy.occupancyLevel}</span>
        </div>
      )}
    </button>
  );
}

export function BusSidePanel({ buses, selectedId, onSelect, routeFilter }: BusSidePanelProps) {
  const filtered = routeFilter === 'all'
    ? buses
    : buses.filter((b) => b.routeId === routeFilter);

  // Ordenar por ocupación (más lleno primero)
  const sorted = [...filtered].sort((a, b) => {
    const ratioA = a.currentPassengers / a.capacity;
    const ratioB = b.currentPassengers / b.capacity;
    return ratioB - ratioA;
  });

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
          {sorted.length} en pantalla · ordenadas por ocupación
        </div>
      </div>

      {/* Lista scrolleable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
      }}>
        {sorted.map((bus) => (
          <BusRow
            key={bus.id}
            bus={bus}
            isSelected={bus.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {sorted.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: '#475569', fontSize: '12px' }}>
            No hay micros en esta ruta
          </div>
        )}
      </div>
    </div>
  );
}
