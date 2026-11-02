import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import * as pushApi from '../../api/pushApi';
import { isWeb } from '../../utils/platform';
import {
  __resetPushRegistration,
  getPushRegistrationState,
  pushProjectId,
  subscribePushRegistration,
  syncPushRegistration,
  unregisterPushBeforeSignOut,
} from '../pushRegistration';

jest.mock('../../api/pushApi', () => ({ registerPushToken: jest.fn(), unregisterPushToken: jest.fn() }));
jest.mock('../../utils/platform', () => ({ ...jest.requireActual('../../utils/platform'), isWeb: jest.fn(() => false) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'proyecto-eas-123' } } }, easConfig: null } }));

const api = jest.mocked(pushApi);
const constants = Constants as unknown as { expoConfig: { extra: Record<string, unknown> } | null; easConfig: { projectId?: string } | null };
const TOKEN = 'ExponentPushToken[test-device-0001]';

beforeEach(async () => {
  jest.clearAllMocks();
  __resetPushRegistration();
  await AsyncStorage.clear();
  jest.mocked(isWeb).mockReturnValue(false);
  constants.expoConfig = { extra: { eas: { projectId: 'proyecto-eas-123' } } };
  constants.easConfig = null;
  api.registerPushToken.mockResolvedValue(undefined);
  api.unregisterPushToken.mockResolvedValue(undefined);
});

it('lee el projectId de EAS de app.json o de easConfig', () => {
  expect(pushProjectId()).toBe('proyecto-eas-123');
  constants.expoConfig = { extra: {} };
  constants.easConfig = { projectId: 'desde-eas' };
  expect(pushProjectId()).toBe('desde-eas');
  constants.easConfig = null;
  expect(pushProjectId()).toBeNull();
});

it('con sesión y notificaciones activas registra el teléfono con su plataforma', async () => {
  const states: string[] = [];
  subscribePushRegistration(() => states.push(getPushRegistrationState().status));

  await syncPushRegistration({ userId: 'u1', enabled: true });

  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proyecto-eas-123' });
  expect(api.registerPushToken).toHaveBeenCalledWith(TOKEN, 'ios');
  expect(states).toEqual(['registering', 'registered']);
  expect(JSON.parse((await AsyncStorage.getItem('transithub.pushToken'))!)).toEqual({ token: TOKEN, userId: 'u1' });
});

it('al desactivarlas quita el teléfono del backend', async () => {
  await syncPushRegistration({ userId: 'u1', enabled: true });
  await syncPushRegistration({ userId: 'u1', enabled: false });

  expect(api.unregisterPushToken).toHaveBeenCalledWith(TOKEN);
  expect(getPushRegistrationState()).toEqual({ status: 'off' });
  expect(await AsyncStorage.getItem('transithub.pushToken')).toBeNull();
});

it('antes de cerrar sesión quita el teléfono, aunque el backend falle', async () => {
  await syncPushRegistration({ userId: 'u1', enabled: true });
  api.unregisterPushToken.mockRejectedValueOnce(new Error('sin conexión'));

  await unregisterPushBeforeSignOut();

  expect(api.unregisterPushToken).toHaveBeenCalledWith(TOKEN);
  expect(getPushRegistrationState()).toEqual({ status: 'off' });
  expect(await AsyncStorage.getItem('transithub.pushToken')).toBeNull();
});

it('si el teléfono cambió de token, quita el anterior', async () => {
  await AsyncStorage.setItem('transithub.pushToken', JSON.stringify({ token: 'ExponentPushToken[viejo-0000000]', userId: 'u0' }));
  await syncPushRegistration({ userId: 'u1', enabled: true });

  expect(api.unregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[viejo-0000000]');
  expect(api.registerPushToken).toHaveBeenCalledWith(TOKEN, 'ios');
});

it('sin projectId de EAS, en Expo Go o en la web no se registra (y lo dice)', async () => {
  constants.expoConfig = { extra: {} };
  await syncPushRegistration({ userId: 'u1', enabled: true });
  expect(getPushRegistrationState()).toEqual({ status: 'unavailable', reason: 'missing-project' });

  constants.expoConfig = { extra: { eas: { projectId: 'proyecto-eas-123' } } };
  jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error('No disponible en Expo Go'));
  await syncPushRegistration({ userId: 'u1', enabled: true });
  expect(getPushRegistrationState()).toEqual({ status: 'unavailable', reason: 'device' });

  jest.mocked(isWeb).mockReturnValue(true);
  await syncPushRegistration({ userId: 'u1', enabled: true });
  expect(getPushRegistrationState()).toEqual({ status: 'unavailable', reason: 'web' });
  expect(api.registerPushToken).not.toHaveBeenCalled();
});

it('si el backend no responde queda en error (se reintenta al volver a sincronizar)', async () => {
  api.registerPushToken.mockRejectedValueOnce(new Error('sin conexión'));
  await syncPushRegistration({ userId: 'u1', enabled: true });
  expect(getPushRegistrationState()).toEqual({ status: 'error' });

  await syncPushRegistration({ userId: 'u1', enabled: true });
  expect(getPushRegistrationState()).toEqual({ status: 'registered' });
});

it('sin sesión no llama al backend', async () => {
  await syncPushRegistration({ userId: null, enabled: true });
  expect(api.registerPushToken).not.toHaveBeenCalled();
  expect(api.unregisterPushToken).not.toHaveBeenCalled();
  expect(getPushRegistrationState()).toEqual({ status: 'off' });
});
