import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { LiveBus } from '../../../realtime/liveBuses';
import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import { BusDetailCard, freshnessColor, occupancyPercent, PREDICTION_COLORS } from '../BusDetailCard';
import { formatClock } from '../MapStatusBar';

const NOW = new Date(2026, 9, 30, 11, 20, 0).getTime();
const bus: LiveBus = {
  ...initialSimulatedBuses(NOW)[0],
  currentPassengers: 52,
  capacity: 80,
  totalBoardings: 31,
  totalAlightings: 12,
  speed: 23.6,
  heading: 89.6,
  status: 'DELAYED',
  lastUpdate: NOW - 3000,
};

describe('BusDetailCard', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('calcula el porcentaje y el color de frescura como el web', () => {
    expect(occupancyPercent(bus)).toBe(65);
    expect(occupancyPercent({ currentPassengers: 3, capacity: 0 })).toBe(0);
    expect([freshnessColor(4), freshnessColor(5), freshnessColor(14), freshnessColor(15)]).toEqual(['#22c55e', '#f59e0b', '#f59e0b', '#ef4444']);
    expect(PREDICTION_COLORS.HIGH.text).toBe('#f87171');
  });

  it('muestra los datos de la micro como la ventanita del web', async () => {
    await render(<BusDetailCard bus={bus} live onClose={jest.fn()} />);

    expect(screen.getByText(bus.id)).toBeTruthy();
    expect(screen.getByText(bus.routeName)).toBeTruthy();
    expect(screen.getByText('Retrasado')).toBeTruthy();
    expect(screen.getByText('Ocupación actual')).toBeTruthy();
    expect(screen.getByText('65%')).toBeTruthy();
    expect(screen.getByText('52 / 80 pasajeros')).toBeTruthy();
    expect(screen.getByLabelText('Subidas: 31')).toBeTruthy();
    expect(screen.getByLabelText('Bajadas: 12')).toBeTruthy();
    expect(screen.getByLabelText('Velocidad: 24 km/h')).toBeTruthy();
    expect(screen.getByLabelText('Dirección: 90°')).toBeTruthy();
    expect(screen.getByText(`Act. ${formatClock(new Date(bus.lastUpdate))}`)).toBeTruthy();
    expect(screen.queryByText(/Predicción/)).toBeNull();
  });

  it('en tiempo real cuenta los segundos desde el último dato', async () => {
    await render(<BusDetailCard bus={bus} live onClose={jest.fn()} />);
    expect(screen.getByText('hace 3s')).toBeTruthy();

    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.getByText('hace 5s')).toBeTruthy();
  });

  it('con la simulación dice "Simulación"', async () => {
    await render(<BusDetailCard bus={bus} live={false} onClose={jest.fn()} />);
    expect(screen.getByText('Simulación')).toBeTruthy();
    expect(screen.queryByText(/^hace/)).toBeNull();
  });

  it('muestra la predicción del backend si viene', async () => {
    const withPrediction: LiveBus = {
      ...bus,
      occupancy: {
        currentRatio: 0.65,
        predictedRatio: 0.724,
        occupancyLevel: 'MEDIUM',
        occupancyText: 'Media',
        occupancyColor: '#f59e0b',
        confidence: 0.12,
        isSimulated: false,
        predictorName: 'EWMA',
      },
    };
    await render(<BusDetailCard bus={withPrediction} live onClose={jest.fn()} />);

    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.getByText('±12% · EWMA')).toBeTruthy();
  });

  it('la ✕ cierra la ficha', async () => {
    const onClose = jest.fn();
    await render(<BusDetailCard bus={bus} live onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: 'Cerrar detalle de la micro' }));
    expect(onClose).toHaveBeenCalled();
  });
});
