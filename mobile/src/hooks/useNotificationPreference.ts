import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  getNotificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermission,
} from '../notifications/notificationService';
import { useSettings } from '../settings/SettingsContext';

/** Estado del botón "Enviar notificación de prueba". */
export type TestNotificationStatus = 'idle' | 'sending' | 'sent' | 'error';

export interface UseNotificationPreferenceResult {
  /** Valor del interruptor: preferencia activa y permiso no rechazado. */
  enabled: boolean;
  /** null mientras se consulta el permiso. */
  permission: NotificationPermission | null;
  /** El pasajero las activó, pero luego quitó el permiso desde los ajustes del teléfono. */
  revoked: boolean;
  /** true mientras se pide el permiso. */
  busy: boolean;
  /** Explicación cuando no se pudieron activar. */
  message: string | null;
  setEnabled: (value: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  testStatus: TestNotificationStatus;
  /** Envía una notificación de ejemplo (con o sin vibración según la preferencia). */
  sendTest: () => Promise<void>;
}

/**
 * Interruptor de notificaciones push de Configuración. Al activarlo pide el
 * permiso del sistema y solo guarda la preferencia si se concede. Vuelve a
 * revisar el permiso al regresar a la app (pudo cambiarse en Ajustes).
 */
export function useNotificationPreference(): UseNotificationPreferenceResult {
  const { settings, updateSettings } = useSettings();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestNotificationStatus>('idle');
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!notificationsSupported()) return;
    try {
      const current = await getNotificationPermission();
      if (mounted.current) setPermission(current);
    } catch {
      // Sin dato de permiso se muestra la preferencia guardada.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  const setEnabled = useCallback(
    async (value: boolean) => {
      setMessage(null);
      setTestStatus('idle');
      if (!value) {
        await updateSettings({ notificationsEnabled: false });
        return;
      }
      setBusy(true);
      try {
        let current = await getNotificationPermission();
        if (current === 'undetermined' || current === 'denied') {
          current = await requestNotificationPermission();
        }
        if (!mounted.current) return;
        setPermission(current);
        if (current === 'granted') {
          await updateSettings({ notificationsEnabled: true });
        } else if (current === 'blocked') {
          setMessage('Las notificaciones están desactivadas para TransitHub. Puedes activarlas desde los ajustes del teléfono.');
        } else {
          setMessage('Sin permiso no podemos enviarte notificaciones.');
        }
      } catch {
        if (mounted.current) setMessage('No se pudieron activar las notificaciones.');
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [updateSettings],
  );

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  const vibrate = settings.vibrationEnabled;
  const sendTest = useCallback(async () => {
    setTestStatus('sending');
    try {
      await sendTestNotification({ vibrate });
      if (mounted.current) setTestStatus('sent');
    } catch {
      if (mounted.current) setTestStatus('error');
    }
  }, [vibrate]);

  const rejected = permission === 'denied' || permission === 'blocked';
  return {
    enabled: settings.notificationsEnabled && !rejected,
    permission,
    revoked: settings.notificationsEnabled && rejected,
    busy,
    message,
    setEnabled,
    openSettings,
    testStatus,
    sendTest,
  };
}
