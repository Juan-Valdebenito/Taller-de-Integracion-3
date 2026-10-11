import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ConnectionStatus } from '../../hooks/useSocketBuses';

interface WebSocketStatusContextValue {
  status: ConnectionStatus | 'idle';
  setStatus: (status: ConnectionStatus | 'idle') => void;
}

const WebSocketStatusContext = createContext<WebSocketStatusContextValue | null>(null);

export function WebSocketStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<ConnectionStatus | 'idle'>('idle');
  const setStatus = useCallback((nextStatus: ConnectionStatus | 'idle') => {
    setStatusState(nextStatus);
  }, []);
  const value = useMemo(() => ({ status, setStatus }), [status, setStatus]);

  return (
    <WebSocketStatusContext.Provider value={value}>
      {children}
    </WebSocketStatusContext.Provider>
  );
}

export function useWebSocketStatus(): WebSocketStatusContextValue {
  const context = useContext(WebSocketStatusContext);
  if (!context) {
    throw new Error('useWebSocketStatus debe usarse dentro de <WebSocketStatusProvider>');
  }
  return context;
}
