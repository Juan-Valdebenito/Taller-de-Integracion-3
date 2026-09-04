/**
 * MapStatusBar.tsx
 *
 * Barra de estado superior del mapa:
 * - Total de micros activas
 * - Modo: Simulación / Tiempo real (socket)
 * - Indicador de conexión Socket.io
 * - Ticker de última actualización
 */

import { useEffect, useState } from 'react';
import { BusState } from '../../../hooks/useSimulatedBuses';

interface MapStatusBarProps {
  buses: BusState[];
  isSocketConnected: boolean;
  routeFilter: string;
}

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }} />
  );
}

export function MapStatusBar({ buses, isSocketConnected, routeFilter }: MapStatusBarProps) {
  const [tick, setTick] = useState(0);

  // Ticker de actualización cada segundo (visual)
  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const active  = buses.filter((b) => b.status === 'ACTIVE').length;
  const stopped = buses.filter((b) => b.status === 'STOPPED').length;
  const delayed = buses.filter((b) => b.status === 'DELAYED').length;

  const now = new Date().toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Suprimir advertencia de variable no usada 'tick'
  void tick;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '40px',
      background: 'hsl(220, 20%, 10%)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
      gap: '16px',
      overflow: 'hidden',
    }}>
      {/* Izquierda: modo y micros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        {/* Modo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <Dot color={isSocketConnected ? '#22c55e' : '#f59e0b'} />
          <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
            {isSocketConnected ? 'Tiempo real' : 'Simulación'}
          </span>
        </div>

        {/* Separador */}
        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }} />

        {/* Contadores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Dot color="#22c55e" />
            <span style={{ color: '#94a3b8' }}>{active} en ruta</span>
          </span>
          {stopped > 0 && (
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Dot color="#f59e0b" />
              <span style={{ color: '#94a3b8' }}>{stopped} detenidas</span>
            </span>
          )}
          {delayed > 0 && (
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Dot color="#ef4444" />
              <span style={{ color: '#94a3b8' }}>{delayed} retrasadas</span>
            </span>
          )}
        </div>
      </div>

      {/* Derecha: ruta activa + hora */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {routeFilter !== 'all' && (
          <span style={{
            fontSize: '11px',
            color: 'hsl(215,80%,65%)',
            background: 'hsla(215,80%,55%,0.15)',
            padding: '2px 8px',
            borderRadius: '9999px',
            border: '1px solid hsla(215,80%,55%,0.25)',
            whiteSpace: 'nowrap',
          }}>
            Filtro activo
          </span>
        )}
        <span style={{ fontSize: '11px', color: '#475569', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {now}
        </span>
      </div>
    </div>
  );
}
