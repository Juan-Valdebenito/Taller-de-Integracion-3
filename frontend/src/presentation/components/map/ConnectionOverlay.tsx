/**
 * ConnectionOverlay.tsx
 *
 * Overlay semi-transparente que aparece sobre el mapa cuando se pierde
 * la conexión WebSocket. Solo aparece después de haber estado conectado
 * (no bloquea durante la conexión inicial).
 */

import { useEffect, useState } from 'react';
import { ConnectionStatus } from '../../../hooks/useSocketBuses';

interface ConnectionOverlayProps {
  status: ConnectionStatus;
}

export function ConnectionOverlay({ status }: ConnectionOverlayProps) {
  const [wasConnected, setWasConnected] = useState(false);

  useEffect(() => {
    if (status === 'connected') {
      setWasConnected(true);
    }
  }, [status]);

  // No mostrar overlay durante la conexión inicial
  // Solo mostrar si ya estuvo conectado y se desconectó
  if (status === 'connected' || !wasConnected) return null;

  return (
    <div
      className="connection-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(10, 14, 26, 0.7)',
        backdropFilter: 'blur(4px)',
        animation: 'overlayFadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          padding: '28px 36px',
          borderRadius: '16px',
          background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.9), rgba(15, 23, 42, 0.95))',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          maxWidth: '320px',
        }}
      >
        {/* Spinner */}
        <div
          style={{
            width: '44px',
            height: '44px',
            margin: '0 auto 16px',
            borderRadius: '50%',
            border: '3px solid rgba(99, 102, 241, 0.15)',
            borderTopColor: '#ef4444',
            animation: 'spinnerRotate 0.8s linear infinite',
          }}
        />

        <div
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#e2e8f0',
            marginBottom: '6px',
          }}
        >
          🔌 Conexión perdida
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#94a3b8',
            lineHeight: 1.5,
          }}
        >
          Se perdió la conexión con el servidor. Reconectando automáticamente...
        </div>

        {/* Pulse bar */}
        <div
          style={{
            marginTop: '16px',
            height: '3px',
            borderRadius: '2px',
            background: 'rgba(99, 102, 241, 0.15)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: '40%',
              borderRadius: '2px',
              background: 'linear-gradient(90deg, #ef4444, #f97316)',
              animation: 'pulseBar 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}
