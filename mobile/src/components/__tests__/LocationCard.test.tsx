import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { UseLocationResult } from '../../hooks/useLocation';
import { LocationCard, formatPosition } from '../LocationCard';

function state(overrides: Partial<UseLocationResult> = {}): UseLocationResult {
  return {
    permission: 'undetermined',
    position: null,
    locating: false,
    error: null,
    requestAndLocate: jest.fn(),
    refresh: jest.fn(),
    openSettings: jest.fn(),
    ...overrides,
  };
}

describe('LocationCard', () => {
  it('sin permiso todavía: explica para qué se usa y ofrece activarla', async () => {
    const location = state({ permission: 'undetermined' });
    await render(<LocationCard location={location} />);

    expect(screen.getByText(/cerca de un paradero/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Activar ubicación' }));
    expect(location.requestAndLocate).toHaveBeenCalledTimes(1);
  });

  it('permiso rechazado: permite volver a pedirlo', async () => {
    const location = state({ permission: 'denied' });
    await render(<LocationCard location={location} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Permitir ubicación' }));
    expect(location.requestAndLocate).toHaveBeenCalledTimes(1);
  });

  it('permiso bloqueado: lleva a los ajustes del teléfono', async () => {
    const location = state({ permission: 'blocked' });
    await render(<LocationCard location={location} />);

    expect(screen.getByText(/ajustes del teléfono/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir ajustes' }));
    expect(location.openSettings).toHaveBeenCalledTimes(1);
  });

  it('con posición: muestra coordenadas y precisión, y permite actualizar', async () => {
    const location = state({
      permission: 'granted',
      position: { latitude: -38.735912, longitude: -72.590431, accuracy: 12.4, timestamp: 1 },
    });
    await render(<LocationCard location={location} />);

    expect(screen.getByText('Ubicación activa')).toBeTruthy();
    expect(screen.getByText('-38.73591, -72.59043 · precisión ±12 m')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar ubicación' }));
    expect(location.refresh).toHaveBeenCalledTimes(1);
  });

  it('muestra el error de ubicación', async () => {
    await render(<LocationCard location={state({ permission: 'granted', error: 'La ubicación del teléfono está desactivada.' })} />);
    expect(screen.getByText('La ubicación del teléfono está desactivada.')).toBeTruthy();
  });

  it('mientras busca la posición lo indica', async () => {
    await render(<LocationCard location={state({ permission: 'granted', locating: true })} />);
    expect(screen.getByText('Obteniendo tu ubicación…')).toBeTruthy();
  });
});

describe('formatPosition', () => {
  it('usa 5 decimales', () => {
    expect(formatPosition(-38.7359123, -72.5904456)).toBe('-38.73591, -72.59045');
  });

  it('en web, con la ubicación bloqueada, explica cómo permitirla en el navegador', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await render(<LocationCard location={state({ permission: 'blocked' })} />);

    expect(screen.getByText(/El navegador bloqueó la ubicación/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir ajustes' })).toBeNull();
    jest.restoreAllMocks();
  });
});
