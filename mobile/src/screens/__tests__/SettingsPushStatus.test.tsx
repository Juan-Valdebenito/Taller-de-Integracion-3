import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';

import { usePushRegistrationState } from '../../hooks/usePushRegistration';
import type { PushRegistrationState } from '../../notifications/pushRegistration';
import { SettingsProvider } from '../../settings/SettingsContext';
import { SETTINGS_KEY } from '../../settings/settingsStorage';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('../../hooks/usePushRegistration', () => ({ usePushRegistrationState: jest.fn() }));

// Estado del registro del teléfono para avisos del servidor, debajo del interruptor.

async function renderWith(state: PushRegistrationState, notificationsEnabled = true) {
  jest.mocked(usePushRegistrationState).mockReturnValue(state);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ notificationsEnabled }));
  await render(
    <SettingsProvider>
      <SettingsScreen />
    </SettingsProvider>,
  );
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Notificaciones push' }).props.value).toBe(notificationsEnabled));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

it('registrado: avisa que también llegan los avisos de reclamos', async () => {
  await renderWith({ status: 'registered' });
  expect(screen.getByText('Este teléfono también recibe avisos del servidor, por ejemplo cuando responden tus reclamos.')).toBeTruthy();
});

it('sin projectId de EAS: explica que aún no está habilitado', async () => {
  await renderWith({ status: 'unavailable', reason: 'missing-project' });
  expect(screen.getByText('Los avisos del servidor (respuestas a tus reclamos) aún no están habilitados en esta versión de la app.')).toBeTruthy();
});

it('en Expo Go o un emulador: las alertas de proximidad siguen funcionando', async () => {
  await renderWith({ status: 'unavailable', reason: 'device' });
  expect(screen.getByText(/no puede recibir avisos del servidor.*Las alertas de proximidad sí funcionan/)).toBeTruthy();
});

it('con error: se reintentará', async () => {
  await renderWith({ status: 'error' });
  expect(screen.getByText(/Se volverá a intentar al abrir la app/)).toBeTruthy();
});

it('con las notificaciones apagadas no muestra nada', async () => {
  await renderWith({ status: 'registered' }, false);
  expect(screen.queryByText(/avisos del servidor/)).toBeNull();
});
