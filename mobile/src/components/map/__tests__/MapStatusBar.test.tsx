import { act, render, screen } from '@testing-library/react-native';

import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import type { ConnectionStatus } from '../../../realtime/types';
import { ConnectionOverlay } from '../ConnectionOverlay';
import { CONNECTION_CONFIG, formatClock, MapStatusBar } from '../MapStatusBar';

const buses = initialSimulatedBuses(0); // 2 en ruta (7A, 7B) y 1 retrasada (1C)
const realtime = (status: ConnectionStatus, extra: Partial<{ latencyMs: number; messagesPerSecond: number; totalMessages: number }> = {}) => ({
  status,
  latencyMs: 0,
  messagesPerSecond: 0,
  totalMessages: 0,
  ...extra,
});

describe('MapStatusBar', () => {
  it('usa las etiquetas y colores de conexión del web', () => {
    expect(CONNECTION_CONFIG).toEqual({
      connected: { label: 'Tiempo real', color: '#22c55e', pulse: false },
      connecting: { label: 'Conectando...', color: '#f59e0b', pulse: true },
      disconnected: { label: 'Desconectado', color: '#ef4444', pulse: false },
    });
  });

  it('conectado: estado, latencia, mensajes por segundo, contadores y total de mensajes', async () => {
    await render(<MapStatusBar buses={buses} realtime={realtime('connected', { latencyMs: 342, messagesPerSecond: 3, totalMessages: 12 })} />);

    expect(screen.getByLabelText('Conexión: Tiempo real')).toBeTruthy();
    expect(screen.getByLabelText('Latencia 342 milisegundos')).toBeTruthy();
    expect(screen.getByLabelText('3 mensajes por segundo')).toBeTruthy();
    expect(screen.getByText('2 en ruta')).toBeTruthy();
    expect(screen.getByText('1 retrasadas')).toBeTruthy();
    expect(screen.queryByText(/detenidas/)).toBeNull();
    expect(screen.getByText('12 msgs')).toBeTruthy();
  });

  it('sin conexión no muestra latencia ni mensajes por segundo', async () => {
    await render(<MapStatusBar buses={buses} realtime={realtime('disconnected')} />);

    expect(screen.getByLabelText('Conexión: Desconectado')).toBeTruthy();
    expect(screen.queryByText(/ms$/)).toBeNull();
    expect(screen.queryByText(/msgs/)).toBeNull();
  });

  it('muestra las detenidas cuando las hay y "Filtro activo" si hay una línea elegida', async () => {
    const withStopped = [...buses, { ...buses[0], id: 'x', status: 'STOPPED' as const }];
    await render(<MapStatusBar buses={withStopped} realtime={realtime('connecting')} routeFilter="route-7A" />);

    expect(screen.getByLabelText('Conexión: Conectando...')).toBeTruthy();
    expect(screen.getByText('1 detenidas')).toBeTruthy();
    expect(screen.getByText('Filtro activo')).toBeTruthy();
  });

  it('la hora avanza cada segundo', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 30, 10, 54, 41) });
    try {
      await render(<MapStatusBar buses={buses} realtime={realtime('connected')} />);
      expect(screen.getByText(formatClock(new Date(2026, 9, 30, 10, 54, 41)))).toBeTruthy();

      await act(async () => jest.advanceTimersByTime(1000));

      expect(screen.getByText(formatClock(new Date(2026, 9, 30, 10, 54, 42)))).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ConnectionOverlay', () => {
  it('no aparece durante la primera conexión, como el web', async () => {
    const { rerender } = await render(<ConnectionOverlay status="connecting" />);
    expect(screen.queryByText('🔌 Conexión perdida')).toBeNull();

    await rerender(<ConnectionOverlay status="disconnected" />);
    expect(screen.queryByText('🔌 Conexión perdida')).toBeNull();
  });

  it('aparece si se pierde una conexión que existía y se va al reconectar', async () => {
    const { rerender } = await render(<ConnectionOverlay status="connected" />);
    expect(screen.queryByText('🔌 Conexión perdida')).toBeNull();

    await rerender(<ConnectionOverlay status="disconnected" />);
    expect(screen.getByText('🔌 Conexión perdida')).toBeTruthy();
    expect(screen.getByText('Se perdió la conexión con el servidor. Reconectando automáticamente...')).toBeTruthy();
    await rerender(<ConnectionOverlay status="connecting" />);
    expect(screen.getByText('🔌 Conexión perdida')).toBeTruthy();

    await rerender(<ConnectionOverlay status="connected" />);
    expect(screen.queryByText('🔌 Conexión perdida')).toBeNull();
  });
});
