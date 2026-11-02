import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthContext';
import {
  getPushRegistrationState,
  subscribePushRegistration,
  syncPushRegistration,
  type PushRegistrationState,
} from '../notifications/pushRegistration';
import { useSettings } from '../settings/SettingsContext';

/** Estado del registro del teléfono para push (para mostrarlo en Configuración). */
export function usePushRegistrationState(): PushRegistrationState {
  return useSyncExternalStore(subscribePushRegistration, getPushRegistrationState, getPushRegistrationState);
}

/**
 * Mantiene registrado el teléfono mientras haya sesión y las notificaciones
 * estén activas. Va una sola vez, en la raíz de la app.
 */
export function usePushRegistrationSync(): void {
  const { status, user } = useAuth();
  const { settings, loaded } = useSettings();
  const userId = status === 'signedIn' ? (user?.id ?? null) : null;
  const enabled = settings.notificationsEnabled;

  useEffect(() => {
    if (!loaded || status === 'loading') return;
    void syncPushRegistration({ userId, enabled });
  }, [loaded, status, userId, enabled]);
}
