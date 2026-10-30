import { render, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { DEFAULT_ZOOM, OSM_TILE_URL, regionForZoom, TEMUCO_CENTER } from '../mapConfig';
import { TransitMap } from '../TransitMap';

describe('mapConfig', () => {
  it('centra el mapa en la Plaza de Armas de Temuco con zoom 14, como el web', () => {
    expect(TEMUCO_CENTER).toEqual({ latitude: -38.7359, longitude: -72.5904 });
    expect(DEFAULT_ZOOM).toBe(14);
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('convierte el zoom de Leaflet en la región de react-native-maps', () => {
    const region = regionForZoom(14, 256, 256);
    // En el zoom 14, 256 px cubren 360 / 2^14 grados de longitud.
    expect(region.longitudeDelta).toBeCloseTo(360 / 2 ** 14, 8);
    expect(region.latitudeDelta).toBeCloseTo((360 / 2 ** 14) * Math.cos((-38.7359 * Math.PI) / 180), 8);
    expect(region).toMatchObject(TEMUCO_CENTER);
    // Un zoom más se ve la mitad del área.
    expect(regionForZoom(15, 256, 256).longitudeDelta).toBeCloseTo(region.longitudeDelta / 2, 8);
  });
});

describe('TransitMap', () => {
  it('muestra Temuco con los mosaicos de OpenStreetMap oscurecidos', async () => {
    await render(<TransitMap />);

    const map = screen.getByLabelText('Mapa de Temuco');
    expect(map.props.initialRegion).toMatchObject(TEMUCO_CENTER);
    expect(map.props.rotateEnabled).toBe(false);
    expect(screen.getByTestId('map-UrlTile').props).toMatchObject({ urlTemplate: OSM_TILE_URL, opacity: 0.72, maximumZ: 19 });
  });

  it('muestra la atribución que exige OpenStreetMap', async () => {
    await render(<TransitMap />);

    expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
  });

  it('dibuja las capas que recibe sobre el mapa', async () => {
    await render(
      <TransitMap>
        <Text>capa de rutas</Text>
      </TransitMap>,
    );

    expect(screen.getByText('capa de rutas')).toBeTruthy();
  });

  it('en Android quita el mapa de Google y deja solo OpenStreetMap', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await render(<TransitMap />);
      expect(screen.getByLabelText('Mapa de Temuco').props.mapType).toBe('none');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
