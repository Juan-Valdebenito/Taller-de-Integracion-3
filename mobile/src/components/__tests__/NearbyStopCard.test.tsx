import { fireEvent, render, screen } from '@testing-library/react-native';

import type { UseNearestStopResult } from '../../hooks/useNearestStop';
import type { ProximityResult } from '../../location/geo';
import { NearbyStopCard } from '../NearbyStopCard';

const stop = { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 };

function proximity(status: ProximityResult['status'], distanceMeters = 45): ProximityResult {
  return { status, nearest: status === 'no-stops' ? null : { stop, distanceMeters }, radiusMeters: 100 };
}

function state(overrides: Partial<UseNearestStopResult> = {}): UseNearestStopResult {
  return { proximity: null, loading: false, error: null, reload: jest.fn(), ...overrides };
}

describe('NearbyStopCard', () => {
  it('sin posición no se muestra', async () => {
    await render(<NearbyStopCard nearby={state()} hasPosition={false} />);
    expect(screen.queryByLabelText('Paradero más cercano')).toBeNull();
  });

  it('mientras busca paraderos', async () => {
    await render(<NearbyStopCard nearby={state({ loading: true })} hasPosition />);
    expect(screen.getByText('Buscando paraderos cercanos…')).toBeTruthy();
  });

  it('dentro del radio: indica el paradero y la distancia', async () => {
    await render(<NearbyStopCard nearby={state({ proximity: proximity('inside', 45) })} hasPosition />);

    expect(screen.getByText('Estás en un paradero')).toBeTruthy();
    expect(screen.getByText(/Plaza de Armas · a 45 m/)).toBeTruthy();
    expect(screen.getByText(/radio de 100 m/)).toBeTruthy();
  });

  it('fuera del radio: muestra el más cercano y cuánto acercarse', async () => {
    await render(<NearbyStopCard nearby={state({ proximity: proximity('outside', 1250) })} hasPosition />);

    expect(screen.getByText('No estás en un paradero')).toBeTruthy();
    expect(screen.getByText(/Plaza de Armas · a 1,3 km/)).toBeTruthy();
    expect(screen.getByText(/menos de 100 m/)).toBeTruthy();
  });

  it('GPS impreciso: no confirma y sugiere actualizar la ubicación', async () => {
    await render(<NearbyStopCard nearby={state({ proximity: proximity('low-accuracy') })} hasPosition />);

    expect(screen.getByText('Ubicación poco precisa')).toBeTruthy();
    expect(screen.getByText(/No podemos confirmar/)).toBeTruthy();
  });

  it('sin paraderos en la zona', async () => {
    await render(<NearbyStopCard nearby={state({ proximity: proximity('no-stops') })} hasPosition />);
    expect(screen.getByText(/No hay paraderos oficiales a menos de 1,0 km/)).toBeTruthy();
  });

  it('permite actualizar los paraderos', async () => {
    const nearby = state({ proximity: proximity('inside') });
    await render(<NearbyStopCard nearby={nearby} hasPosition />);

    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar paraderos' }));
    expect(nearby.reload).toHaveBeenCalledTimes(1);
  });

  it('error: lo muestra y ofrece reintentar', async () => {
    const nearby = state({ error: 'El servicio de paraderos no está disponible. Intenta más tarde.' });
    await render(<NearbyStopCard nearby={nearby} hasPosition />);

    expect(screen.getByRole('alert')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(nearby.reload).toHaveBeenCalledTimes(1);
  });
});
