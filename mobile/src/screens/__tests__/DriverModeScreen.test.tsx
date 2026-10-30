import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CompanyBus, CompanyRoute, RouteStop } from '../../api/companyApi';
import { useDriverTrip, type UseDriverTripResult } from '../../hooks/useDriverTrip';
import { useRouteStops } from '../../hooks/useRouteStops';
import { DriverModeScreen } from '../DriverModeScreen';

jest.mock('../../hooks/useDriverTrip', () => ({ useDriverTrip: jest.fn() }));
jest.mock('../../hooks/useRouteStops', () => ({ useRouteStops: jest.fn() }));

const buses: CompanyBus[] = [
  { id: 'd', patente: 'BGPK-45', capacity: 35, currentPassengers: 14, status: 'INACTIVE', companyId: 'co1', routeId: null },
  { id: 'm', patente: 'FGRT-33', capacity: 35, currentPassengers: 0, status: 'MAINTENANCE', companyId: 'co1', routeId: null },
];
const routes: CompanyRoute[] = [
  { id: 'r1', code: '7A', name: 'Cajón / Santa Rosa', isActive: true, companyId: 'co1' },
  { id: 'r2', code: '1C', name: 'Labranza / Centro', isActive: true, companyId: 'co1' },
];
const stops = (n: number): RouteStop[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Paradero ${i + 1}`, latitude: 0, longitude: 0, order: i + 1 }));

function mockDriver(overrides: Partial<UseDriverTripResult> = {}) {
  const value: UseDriverTripResult = {
    buses,
    routes,
    selectedBus: buses[0],
    selectedRoute: routes[0],
    selectBus: jest.fn(),
    selectRoute: jest.fn(),
    trip: null,
    busy: false,
    loading: false,
    error: null,
    actionError: null,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  jest.mocked(useDriverTrip).mockReturnValue(value);
  return value;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRouteStops).mockReturnValue({ stops: stops(4), loading: false, error: null, reload: jest.fn() });
});

describe('DriverModeScreen', () => {
  it('muestra el encabezado y la tarjeta "Preparar recorrido" del web', async () => {
    mockDriver();
    await render(<DriverModeScreen />);

    expect(screen.getByText('Operación en terreno')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Modo conductor' })).toBeTruthy();
    expect(screen.getByText('Controla tu unidad y mantén informada la ruta.')).toBeTruthy();
    expect(screen.getByLabelText('Conectado')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Preparar recorrido' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unidad asignada: BGPK-45 · Disponible' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recorrido: Línea 7A · Cajón / Santa Rosa' })).toBeTruthy();
    expect(screen.getByText('14/35 pasajeros')).toBeTruthy();
    expect(screen.getByText('4 paradas')).toBeTruthy();
    expect(useRouteStops).toHaveBeenCalledWith('r1');
  });

  it('las micros en mantenimiento aparecen deshabilitadas, como el web', async () => {
    mockDriver();
    await render(<DriverModeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Unidad asignada: BGPK-45 · Disponible' }));
    expect(screen.getByRole('radio', { name: 'FGRT-33 · Mantenimiento' })).toBeDisabled();
  });

  it('elegir recorrido e iniciar usan el recorrido del hook', async () => {
    const driver = mockDriver();
    await render(<DriverModeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Recorrido: Línea 7A · Cajón / Santa Rosa' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Línea 1C · Labranza / Centro' }));
    expect(driver.selectRoute).toHaveBeenCalledWith('r2');

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar recorrido' }));
    expect(driver.start).toHaveBeenCalled();
  });

  it('sin micro que pueda salir, "Iniciar recorrido" queda deshabilitado y lo explica', async () => {
    mockDriver({ selectedBus: null });
    await render(<DriverModeScreen />);

    expect(screen.getByText('No hay micros disponibles para salir a recorrido.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar recorrido' })).toBeDisabled();
  });

  it('muestra el error al iniciar y, sin datos, "Sin conexión" con Reintentar', async () => {
    mockDriver({ actionError: 'No se pudo iniciar el recorrido: sin permiso' });
    const { rerender } = await render(<DriverModeScreen />);
    expect(screen.getByText('No se pudo iniciar el recorrido: sin permiso')).toBeTruthy();

    const driver = mockDriver({ buses: [], routes: [], selectedBus: null, selectedRoute: null, error: 'No se pudo cargar la información de la empresa.' });
    await rerender(<DriverModeScreen />);
    expect(screen.getByLabelText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(driver.refresh).toHaveBeenCalled();
  });

  it('con el recorrido iniciado muestra "En recorrido", la línea y Finalizar', async () => {
    const driver = mockDriver({ trip: { bus: { ...buses[0], status: 'ACTIVE', routeId: 'r1' }, route: routes[0], startedAt: 0 } });
    await render(<DriverModeScreen />);

    expect(screen.getByText('En recorrido')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Línea 7A' })).toBeTruthy();
    expect(screen.getByText('Cajón / Santa Rosa · Unidad BGPK-45')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Preparar recorrido' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Finalizar' }));
    expect(driver.stop).toHaveBeenCalled();
  });
});
