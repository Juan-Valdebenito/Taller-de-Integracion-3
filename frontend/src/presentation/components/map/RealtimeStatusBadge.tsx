/**
 * RealtimeStatusBadge.tsx
 *
 * Indicador flotante del estado de la conexión Socket.io del mapa:
 * - En vivo por WebSocket (wss://): lo esperado detrás del Ingress.
 * - En vivo por polling HTTP: funciona, pero indica que el Ingress no
 *   está permitiendo el Upgrade a WebSocket (ver kubernetes/ingress/).
 * - Conectando / Reconectando: las posiciones pueden estar desactualizadas.
 */

import { useEffect, useState } from 'react';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface RealtimeStatusBadgeProps {
  status: RealtimeStatus;
  /** Transporte activo de Engine.IO: 'websocket' | 'polling' | ... */
  transport: string | null;
  reconnectAttempt: number;
  /** Momento (ms) del último evento de buses recibido */
  lastUpdateAt: number | null;
}

// Sin eventos durante este tiempo con el socket conectado = datos posiblemente congelados
const STALE_AFTER_MS = 15_000;

export function RealtimeStatusBadge({ status, transport, reconnectAttempt, lastUpdateAt }: RealtimeStatusBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsAgo = lastUpdateAt ? Math.max(0, Math.round((now - lastUpdateAt) / 1000)) : null;
  const isStale = status === 'connected' && lastUpdateAt !== null && now - lastUpdateAt > STALE_AFTER_MS;

  let color: string;
  let label: string;
  let hint: string;

  if (status === 'connected' && transport === 'websocket') {
    color = isStale ? '#f59e0b' : '#22c55e';
    label = 'En vivo';
    hint = 'Conectado por WebSocket (wss://)';
  } else if (status === 'connected') {
    color = '#f59e0b';
    label = 'En vivo (respaldo HTTP)';
    hint = 'El WebSocket no está disponible y se usa polling HTTP. Revisar el soporte de WebSocket del Ingress.';
  } else if (status === 'reconnecting') {
    color = '#ef4444';
    label = reconnectAttempt > 0 ? `Reconectando… (intento ${reconnectAttempt})` : 'Reconectando…';
    hint = 'Se perdió la conexión en tiempo real: las posiciones pueden estar desactualizadas.';
  } else if (status === 'offline') {
    color = '#64748b';
    label = 'Desconectado';
    hint = 'Conexión en tiempo real cerrada.';
  } else {
    color = '#64748b';
    label = 'Conectando…';
    hint = 'Estableciendo conexión en tiempo real.';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      title={hint}
      style={{
        position: 'absolute',
        top: '28px',
        right: '28px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '9999px',
        background: 'rgba(15, 23, 42, 0.88)',
        border: `1px solid ${color}55`,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        fontSize: '12px',
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 3px ${color}33`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 600 }}>{label}</span>
      {status === 'connected' && secondsAgo !== null && (
        <span style={{ color: isStale ? '#f59e0b' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          · {isStale ? `sin datos hace ${secondsAgo}s` : `hace ${secondsAgo}s`}
        </span>
      )}
    </div>
  );
}
