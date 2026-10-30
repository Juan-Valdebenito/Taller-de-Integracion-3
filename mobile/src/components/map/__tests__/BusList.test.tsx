import { fireEvent, render, screen } from '@testing-library/react-native';

import { computeEta } from '../../../hooks/useEta';
import type { LiveBus } from '../../../realtime/liveBuses';
import { initialSimulatedBuses } from '../../../realtime/simulatedBuses';
import { BusList, busListSummary, sortByOccupancy } from '../BusList';

const [a, b, c] = initialSimulatedBuses(Date.now());
const buses: LiveBus[] = [
  { ...a, id: 'media', currentPassengers: 40, capacity: 80, speed: 30, status: 'ACTIVE' },
  { ...b, id: 'llena', currentPassengers: 76, capacity: 80, speed: 0, status: 'STOPPED' },
  { ...c, id: 'vacia', currentPassengers: 8, capacity: 80, speed: 20, status: 'DELAYED' },
];

describe('BusList', () => {
  it('ordena por ocupación, la más llena primero, y resume como el web', () => {
    expect(sortByOccupancy(buses).map((bus) => bus.id)).toEqual(['llena', 'media', 'vacia']);
    expect(busListSummary(3)).toBe('3 en pantalla · ordenadas por ocupación');
  });

  it('muestra cada micro con estado, ocupación, velocidad y línea, en orden', async () => {
    await render(<BusList buses={buses} selectedId={null} onSelect={jest.fn()} live />);

    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      `Micro llena, ${b.routeName}, Detenido, 95% ocupado`,
      `Micro media, ${a.routeName}, En ruta, 50% ocupado`,
      `Micro vacia, ${c.routeName}, Retrasado, 10% ocupado`,
    ]);
    expect(screen.getByText('95% ocupado')).toBeTruthy();
    expect(screen.getByText('30 km/h')).toBeTruthy();
    expect(screen.getByText(a.routeName)).toBeTruthy();
  });

  it('muestra el tiempo a la próxima parada, salvo si la micro está detenida', async () => {
    await render(<BusList buses={buses} selectedId={null} onSelect={jest.fn()} live />);

    const eta = computeEta(buses[0]).nextStop!;
    expect(screen.getAllByText(`⏱ ${eta.etaLabel}`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^⏱/)).toHaveLength(2); // la detenida no tiene
  });

  it('muestra la predicción del backend si viene', async () => {
    const withPrediction = [{ ...buses[0], occupancy: { currentRatio: 0.5, predictedRatio: 0.62, occupancyLevel: 'MEDIUM' as const, occupancyText: 'Media', occupancyColor: '#f59e0b', confidence: 0.2, isSimulated: false, predictorName: 'EWMA' } }];
    await render(<BusList buses={withPrediction} selectedId={null} onSelect={jest.fn()} live />);

    expect(screen.getByText('📊 Pred: 62%')).toBeTruthy();
    expect(screen.getByText('MEDIUM')).toBeTruthy();
  });

  it('marca la elegida y al tocar una fila avisa cuál es', async () => {
    const onSelect = jest.fn();
    await render(<BusList buses={buses} selectedId="media" onSelect={onSelect} live={false} />);

    expect(screen.getByRole('button', { name: /^Micro media/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /^Micro llena/ })).not.toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: /^Micro vacia/ }));
    expect(onSelect).toHaveBeenCalledWith('vacia');
  });

  it('mientras conecta muestra filas de carga, y sin micros "No hay micros en esta ruta"', async () => {
    const { rerender } = await render(<BusList buses={buses} selectedId={null} onSelect={jest.fn()} live loading />);
    expect(screen.getByLabelText('Cargando micros')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    await rerender(<BusList buses={[]} selectedId={null} onSelect={jest.fn()} live />);
    expect(screen.getByText('No hay micros en esta ruta')).toBeTruthy();
  });
});
