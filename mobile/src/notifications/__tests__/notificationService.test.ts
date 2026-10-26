import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ProximityAlert } from '../../alerts/proximityAlerts';
import {
  ALERTS_CHANNEL_ID,
  SILENT_ALERTS_CHANNEL_ID,
  __resetNotificationSetup,
  getNotificationPermission,
  notifyProximityAlert,
  requestNotificationPermission,
  sendTestNotification,
  setupNotifications,
} from '../notificationService';

const mock = Notifications as unknown as typeof Notifications & {
  __permission: (status: 'granted' | 'undetermined' | 'denied', canAskAgain?: boolean) => Notifications.NotificationPermissionsStatus;
};
const m = (fn: unknown) => fn as jest.Mock;

const alert: ProximityAlert = {
  bus: { id: 'b1', patente: 'ABCD12', latitude: -38.73, longitude: -72.59, speed: null, locationAt: 1, routeId: null },
  distanceMeters: 350,
  stop: { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 },
  message: 'La micro ABCD12 está a 350 m de Plaza de Armas.',
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetNotificationSetup();
});

afterEach(() => jest.restoreAllMocks());

describe('permiso de notificaciones', () => {
  it.each([
    [mock.__permission('granted'), 'granted'],
    [mock.__permission('undetermined'), 'undetermined'],
    [mock.__permission('denied', true), 'denied'],
    [mock.__permission('denied', false), 'blocked'],
  ])('%#: %p → %p', async (response, expected) => {
    m(Notifications.getPermissionsAsync).mockResolvedValueOnce(response);
    await expect(getNotificationPermission()).resolves.toBe(expected);
  });

  it('iOS provisional (notificaciones silenciosas) cuenta como concedido', async () => {
    m(Notifications.getPermissionsAsync).mockResolvedValueOnce({
      ...mock.__permission('undetermined'),
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    });
    await expect(getNotificationPermission()).resolves.toBe('granted');
  });

  it('pedir el permiso muestra el diálogo del sistema', async () => {
    m(Notifications.requestPermissionsAsync).mockResolvedValueOnce(mock.__permission('denied', false));
    await expect(requestNotificationPermission()).resolves.toBe('blocked');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('setupNotifications', () => {
  it('muestra las notificaciones también con la app abierta', async () => {
    await setupNotifications();

    const handler = m(Notifications.setNotificationHandler).mock.calls[0][0];
    await expect(handler.handleNotification()).resolves.toMatchObject({ shouldShowBanner: true, shouldShowList: true });
  });

  it('en Android crea los canales con y sin vibración, una sola vez', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await setupNotifications();
    await setupNotifications();

    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      ALERTS_CHANNEL_ID,
      expect.objectContaining({ enableVibrate: true }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      SILENT_ALERTS_CHANNEL_ID,
      expect.objectContaining({ enableVibrate: false }),
    );
  });

  it('en iOS no hay canales', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await setupNotifications();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('notifyProximityAlert', () => {
  it('muestra la alerta de inmediato con el mensaje y los datos de la micro', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await notifyProximityAlert(alert, { vibrate: true });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Tu micro se acerca',
        body: 'La micro ABCD12 está a 350 m de Plaza de Armas.',
        sound: 'default',
        data: { type: 'proximity-alert', busId: 'b1', stopId: 'p1' },
      },
      trigger: null,
    });
  });

  it('sin vibración: sin sonido en iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await notifyProximityAlert(alert, { vibrate: false });
    expect(m(Notifications.scheduleNotificationAsync).mock.calls[0][0].content.sound).toBe(false);
  });

  it.each([
    [true, ALERTS_CHANNEL_ID],
    [false, SILENT_ALERTS_CHANNEL_ID],
  ])('Android con vibración=%p usa el canal %p', async (vibrate, channelId) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await notifyProximityAlert(alert, { vibrate });
    expect(m(Notifications.scheduleNotificationAsync).mock.calls[0][0].trigger).toEqual({ channelId });
  });

describe('sendTestNotification', () => {
  it('envía una notificación de ejemplo inmediata', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await sendTestNotification({ vibrate: true });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Notificación de prueba',
        body: 'Así te avisaremos cuando una micro se acerque a tu paradero.',
        sound: 'default',
        data: { type: 'test' },
      },
      trigger: null,
    });
  });

  it('en Android respeta la preferencia de vibración (canal silencioso)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await sendTestNotification({ vibrate: false });
    expect(m(Notifications.scheduleNotificationAsync).mock.calls[0][0].trigger).toEqual({ channelId: SILENT_ALERTS_CHANNEL_ID });
  });
});
});

describe('vista previa web', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  it('no configura ni muestra notificaciones (no existen en el navegador)', async () => {
    await setupNotifications();
    await notifyProximityAlert(alert, { vibrate: true });
    await sendTestNotification({ vibrate: true });

    expect(Notifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
