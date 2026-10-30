import { Text } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import PassengerLayout from '../../app/(app)/_layout';

// Pestañas del pasajero con el layout real: el menú del web (🗺️ Mapa,
// 📋 Reclamos) más Perfil y Configuración.

// En el renderRouter de pruebas la barra de pestañas queda marcada como oculta
// para accesibilidad (por cómo monta las pantallas), así que se incluye.
const HIDDEN = { includeHiddenElements: true };

/** Botones de pestaña: su etiqueta accesible es "Reclamos, tab, 2 of 4". */
const tabButtons = () => screen.getAllByRole('button', { name: /, tab, \d+ of \d+$/, ...HIDDEN });

const routes = {
  _layout: PassengerLayout,
  index: () => <Text>contenido mapa</Text>,
  complaints: () => <Text>contenido reclamos</Text>,
  profile: () => <Text>contenido perfil</Text>,
  settings: () => <Text>contenido configuración</Text>,
};

describe('pestañas del pasajero', () => {
  it('abre en el Mapa, como el web (/passenger/map)', async () => {
    const router = await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('contenido mapa')).toBeTruthy();
    expect(router.getPathname()).toBe('/');
  });

  it('muestra Mapa, Reclamos, Perfil y Configuración con sus emojis, en ese orden', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    const labels = tabButtons().map((tab) => (tab.props.accessibilityLabel as string).split(',')[0]);
    expect(labels).toEqual(['Mapa', 'Reclamos', 'Perfil', 'Configuración']);
    for (const emoji of ['🗺️', '📋', '👤', '⚙️']) {
      expect(screen.getAllByText(emoji, HIDDEN).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['Reclamos', 'contenido reclamos', '/complaints'],
    ['Perfil', 'contenido perfil', '/profile'],
    ['Configuración', 'contenido configuración', '/settings'],
  ])('la pestaña %s abre su pantalla', async (tab, text, pathname) => {
    const router = await renderRouter(routes, { initialUrl: '/' });

    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${tab}, tab,`), ...HIDDEN }));

    expect(await screen.findByText(text)).toBeTruthy();
    expect(router.getPathname()).toBe(pathname);
  });
});
