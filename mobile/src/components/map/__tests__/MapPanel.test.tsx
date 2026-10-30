import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MapPanel } from '../MapPanel';
import { UserLocationLayer } from '../UserLocationLayer';

describe('MapPanel', () => {
  async function renderPanel(initiallyOpen?: boolean) {
    await render(
      <MapPanel title="📍 Tu ubicación y alertas" summary="Activa tu ubicación" initiallyOpen={initiallyOpen}>
        <Text>contenido del panel</Text>
      </MapPanel>,
    );
  }

  it('empieza plegado, con el título y el resumen, para ver el mapa completo', async () => {
    await renderPanel();

    const header = screen.getByRole('button', { name: '📍 Tu ubicación y alertas' });
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByText('Activa tu ubicación')).toBeTruthy();
    expect(screen.queryByText('contenido del panel')).toBeNull();
  });

  it('al tocarlo se despliega y al tocarlo de nuevo se pliega', async () => {
    await renderPanel();
    const header = () => screen.getByRole('button', { name: '📍 Tu ubicación y alertas' });

    await fireEvent.press(header());
    expect(screen.getByText('contenido del panel')).toBeTruthy();
    expect(header().props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.queryByText('Activa tu ubicación')).toBeNull();

    await fireEvent.press(header());
    expect(screen.queryByText('contenido del panel')).toBeNull();
  });

  it('puede empezar abierto', async () => {
    await renderPanel(true);

    expect(screen.getByText('contenido del panel')).toBeTruthy();
  });
});

describe('UserLocationLayer', () => {
  const position = { latitude: -38.7365, longitude: -72.5878, accuracy: 25, timestamp: 0 };

  it('sin ubicación no dibuja nada', async () => {
    await render(<UserLocationLayer position={null} />);

    expect(screen.queryByTestId('map-Marker')).toBeNull();
    expect(screen.queryByTestId('map-Circle')).toBeNull();
  });

  it('dibuja tu ubicación y el círculo con la precisión del GPS en metros', async () => {
    await render(<UserLocationLayer position={position} />);

    expect(screen.getByLabelText('Tu ubicación').props.coordinate).toEqual({ latitude: -38.7365, longitude: -72.5878 });
    expect(screen.getByTestId('map-Circle').props).toMatchObject({ radius: 25, center: { latitude: -38.7365, longitude: -72.5878 } });
  });

  it('sin precisión informada dibuja solo el punto', async () => {
    await render(<UserLocationLayer position={{ ...position, accuracy: null }} />);

    expect(screen.getByLabelText('Tu ubicación')).toBeTruthy();
    expect(screen.queryByTestId('map-Circle')).toBeNull();
  });
});
