/**
 * MapStatusBar.tsx
 *
 * Barra de estado superior premium del mapa con:
 * - Estado de conexión WS con 3 estados visuales
 * - Latencia del WebSocket
 * - Mensajes por segundo
 * - Contadores de buses por estado
 * - Ticker de hora actual
 */

import { useEffect, useState } from 'react';
import { BusState } from '../../../hooks/useSimulatedBuses';
import type { ConnectionStatus, SocketBusesState } from '../../../hooks/useSocketBuses';

interface MapStatusBarProps {
  buses: BusState[];
  wsState: SocketBusesState;
  routeFilter: string;
}

/** Configuración visual para cada estado de conexión */
const CONNECTION_CONFIG: Record<ConnectionStatus, { label: string; color: string; dotAnim: boolean }> = {
  connected:    { label: 'Tiempo real',   color: '#22c55e', dotAnim: false },
  connecting:   { label: 'Conectando...', color: '#f59e0b', dotAnim: true },
  disconnected: { label: 'Desconectado',  color: '#ef4444', dotAnim: false },
};

function StatusDot({ color, animate }: { color: string; animate: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      animation: animate ? 'statusPulse 1.2s ease infinite' : 'none',
    }} />
  );
}

function Separator() {
  return <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)' }} />;
}

export function MapStatusBar({ buses, wsState, routeFilter }: MapStatusBarProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  void tick;

  const active  = buses.filter((b) => b.status === 'ACTIVE').length;
  const stopped = buses.filter((b) => b.status === 'STOPPED').length;
  const delayed = buses.filter((b) => b.status === 'DELAYED').length;

  const now = new Date().toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const connConfig = CONNECTION_CONFIG[wsState.status];

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
      {/* Izquierda: conexión + contadores */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {/* Estado de conexión */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 10px',
          borderRadius: '9999px',
          background: `${connConfig.color}15`,
          border: `1px solid ${connConfig.color}30`,
          flexShrink: 0,
        }}>
          <StatusDot color={connConfig.color} animate={connConfig.dotAnim} />
          <span style={{ fontSize: '11px', color: connConfig.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {connConfig.label}
          </span>
        </div>

        <Separator />

        {/* Latencia + msg/s (solo si conectado) */}
        {wsState.status === 'connected' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                📡 <span style={{ color: '#c084fc', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{wsState.latencyMs}ms</span>
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                📨 <span style={{ color: '#818cf8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{wsState.messagesPerSecond}/s</span>
              </span>
            </div>
            <Separator />
          </>
        )}

        {/* Contadores de buses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <StatusDot color="#22c55e" animate={false} />
            <span style={{ color: '#94a3b8' }}>{active} en ruta</span>
          </span>
          {stopped > 0 && (
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <StatusDot color="#f59e0b" animate={false} />
              <span style={{ color: '#94a3b8' }}>{stopped} detenidas</span>
            </span>
          )}
          {delayed > 0 && (
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <StatusDot color="#ef4444" animate={false} />
              <span style={{ color: '#94a3b8' }}>{delayed} retrasadas</span>
            </span>
          )}
        </div>
      </div>

      {/* Derecha: filtro + total mensajes + hora */}
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
        {wsState.totalMessages > 0 && (
          <span style={{
            fontSize: '10px', color: '#475569',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>
            {wsState.totalMessages} msgs
          </span>
        )}
        <span style={{ fontSize: '11px', color: '#475569', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {now}
        </span>
      </div>
    </div>
  );
}
