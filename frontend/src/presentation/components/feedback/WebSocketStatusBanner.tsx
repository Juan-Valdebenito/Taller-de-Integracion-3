import { useWebSocketStatus } from '../../context/WebSocketStatusContext';
import styles from './WebSocketStatusBanner.module.css';

export function WebSocketStatusBanner() {
  const { status } = useWebSocketStatus();

  if (status === 'connected' || status === 'idle') return null;

  const isConnecting = status === 'connecting';

  return (
    <div
      className={`${styles.banner} ${isConnecting ? styles.connecting : styles.error}`}
      role={isConnecting ? 'status' : 'alert'}
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden="true">
        {isConnecting ? '↻' : '!'}
      </span>
      <div>
        <strong>{isConnecting ? 'Conectando al tiempo real' : 'Sin conexión en tiempo real'}</strong>
        <span className={styles.message}>
          {isConnecting
            ? 'Los datos se actualizarán cuando el servidor responda.'
            : 'Mostrando datos de respaldo. Intentaremos reconectar automáticamente.'}
        </span>
      </div>
      {isConnecting && <span className={styles.spinner} aria-hidden="true" />}
    </div>
  );
}
