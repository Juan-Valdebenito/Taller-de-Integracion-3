/**
 * Notificaciones del teléfono con expo-notifications.
 *
 * Son notificaciones locales: las crea la app cuando detecta una micro que se
 * acerca al paradero (ver useProximityAlerts). Funcionan en Expo Go. Las push
 * enviadas desde un servidor requieren un build con EAS y un endpoint en el
 * backend para registrar el token del dispositivo.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ProximityAlert } from '../alerts/proximityAlerts';

/** Mismo modelo que el permiso de ubicación. */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked';

/** Canales de Android: la vibración se define por canal, por eso hay uno con y otro sin. */
export const ALERTS_CHANNEL_ID = 'proximity-alerts';
export const SILENT_ALERTS_CHANNEL_ID = 'proximity-alerts-silent';

function toPermission(status: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (status.status === Notifications.PermissionStatus.UNDETERMINED) {
    return 'undetermined';
  }
  return status.canAskAgain ? 'denied' : 'blocked';
}

/** Consulta el permiso sin mostrar ningún diálogo. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Muestra el diálogo del sistema (si aún se puede) y devuelve el resultado. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.requestPermissionsAsync());
}

let configured = false;

/**
 * Configuración inicial (una vez al abrir la app): mostrar las notificaciones
 * también con la app abierta y crear los canales de Android.
 */
export async function setupNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Promise.all([
      Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
        name: 'Alertas de proximidad',
        description: 'Micros que se acercan a tu paradero.',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
        vibrationPattern: [0, 250, 150, 250],
      }),
      Notifications.setNotificationChannelAsync(SILENT_ALERTS_CHANNEL_ID, {
        name: 'Alertas de proximidad (sin vibración)',
        description: 'Micros que se acercan a tu paradero, sin vibrar.',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: false,
        vibrationPattern: null,
      }),
    ]);
  }
}

/** Muestra la alerta de proximidad como notificación del teléfono (inmediata). */
export async function notifyProximityAlert(alert: ProximityAlert, { vibrate }: { vibrate: boolean }): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tu micro se acerca',
      body: alert.message,
      sound: vibrate ? 'default' : false,
      data: { type: 'proximity-alert', busId: alert.bus.id, stopId: alert.stop.id },
    },
    trigger: Platform.OS === 'android' ? { channelId: vibrate ? ALERTS_CHANNEL_ID : SILENT_ALERTS_CHANNEL_ID } : null,
  });
}

/** Testing: permite volver a ejecutar setupNotifications. */
export function __resetNotificationSetup(): void {
  configured = false;
}
