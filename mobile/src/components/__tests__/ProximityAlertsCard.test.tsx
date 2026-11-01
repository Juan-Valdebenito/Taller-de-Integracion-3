import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BusPosition } from '../../api/busesApi';
import type { UseProximityAlertsResult } from '../../hooks/useProximityAlerts';
import type { Stop } from '../../location/geo';
import { ProximityAlertsCard } from '../ProximityAlertsCard';

const STOP: Stop = { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 };
const bus = (id: string, patente = id.toUpperCase()): BusPosition => ({
  id,
  patente,
  latitude: -38.73,
  longitude: -72.59,
  speed: null,
  locationAt: 1,
  routeId: null,
});

function state(overrides: Partial<UseProximityAlertsResult> = {}): UseProximityAlertsResult {
  return {
    enabled: true,
    pausedReason: null,
    stop: STOP,
    approaching: [],
    alert: null,
    dismissAlert: jest.fn(),
    loading: false,
    error: null,
    checkNow: jest.fn(),
    ...overrides,
  };
}

describe('ProximityAlertsCard', () => {
  it('en pausa: muestra el motivo y no ofrece buscar micros', async () => {
    await render(
      <ProximityAlertsCard
        alerts={state({ enabled: false, stop: null, pausedReason: 'Acércate a menos de 100 m de un paradero oficial para recibir alertas.' })}
      />,
    );

    expect(screen.getByText('Alertas de proximidad en pausa')).toBeTruthy();
    expect(screen.getByText(/Acércate a menos de 100 m/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('activas: indica el paradero vigilado y el radio de alerta', async () => {
    await render(<ProximityAlertsCard alerts={state()} />);

    expect(screen.getByText('Alertas activas')).toBeTruthy();
    expect(screen.getByText(/a menos de 500 m de Plaza de Armas/)).toBeTruthy();
    expect(screen.getByText('Ninguna micro se acerca por ahora.')).toBeTruthy();
  });

  it('lista las micros que se acercan', async () => {
    await render(
      <ProximityAlertsCard
        alerts={state({
          approaching: [
            { bus: bus('b1'), distanceMeters: 120 },
            { bus: bus('b2', ''), distanceMeters: 480 },
          ],
        })}
      />,
    );

    expect(screen.getByText('B1 · a 120 m')).toBeTruthy();
    expect(screen.getByText('Micro sin patente · a 480 m')).toBeTruthy();
  });

  it('muestra la alerta y permite descartarla', async () => {
    const alerts = state({
      alert: { bus: bus('b1'), distanceMeters: 350, stop: STOP, message: 'La micro B1 está a 350 m de Plaza de Armas.' },
    });
    await render(<ProximityAlertsCard alerts={alerts} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('La micro B1 está a 350 m de Plaza de Armas.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Entendido' }));
    expect(alerts.dismissAlert).toHaveBeenCalledTimes(1);
  });

  it('permite buscar micros ahora', async () => {
    const alerts = state();
    await render(<ProximityAlertsCard alerts={alerts} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Buscar micros ahora' }));
    expect(alerts.checkNow).toHaveBeenCalledTimes(1);
  });
});
