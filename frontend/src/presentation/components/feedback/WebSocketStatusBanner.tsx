import { useWebSocketStatus } from '../../context/WebSocketStatusContext';

export function WebSocketStatusBanner() {
  const { status } = useWebSocketStatus();

  if (status === 'connected' || status === 'idle') return null;

  const isConnecting = status === 'connecting';

  return (
    <div
      className={`websocket-status-banner ${isConnecting ? 'is-connecting' : 'is-error'}`}
      role={isConnecting ? 'status' : 'alert'}
      aria-live="polite"
    >
      <span className="websocket-status-icon" aria-hidden="true">
        {isConnecting ? '↻' : '!'}
      </span>
      <div>
        <strong>{isConnecting ? 'Conectando al tiempo real' : 'Sin conexión en tiempo real'}</strong>
        <span>
          {isConnecting
            ? 'Los datos se actualizarán cuando el servidor responda.'
            : 'Mostrando datos de respaldo. Intentaremos reconectar automáticamente.'}
        </span>
      </div>
      {isConnecting && <span className="websocket-status-spinner" aria-hidden="true" />}
    </div>
  );
}
