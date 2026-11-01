/**
 * Registro del teléfono para notificaciones push enviadas por backend-go
 * (Expo Push), por ejemplo cuando responden un reclamo.
 *
 * - Se registra cuando hay sesión y el pasajero activó las notificaciones.
 * - Se quita al desactivarlas y antes de cerrar sesión (así no le llegan avisos
 *   de esa cuenta a quien use el teléfono después).
 * - Necesita el projectId de EAS (`npx eas init`) y un build de desarrollo:
 *   Expo Go y la vista previa web no reciben push del servidor.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '../api/pushApi';
import { isWeb } from '../utils/platform';
import { setupNotifications } from './notificationService';

export type PushRegistrationState =
  | { status: 'off' }
  | { status: 'registering' }
  | { status: 'registered' }
  /** El teléfono o la versión de la app no puede recibir push del servidor. */
  | { status: 'unavailable'; reason: 'web' | 'missing-project' | 'device' }
  | { status: 'error' };

/** Token registrado por última vez y de qué cuenta (para quitarlo después). */
const STORED_KEY = 'transithub.pushToken';
interface StoredToken {
  token: string;
  userId: string;
}

let state: PushRegistrationState = { status: 'off' };
const listeners = new Set<() => void>();

function setState(next: PushRegistrationState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getPushRegistrationState = () => state;

export function subscribePushRegistration(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** projectId de EAS: lo agrega `npx eas init` en app.json (extra.eas.projectId). */
export function pushProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId;
  const id = typeof fromConfig === 'string' ? fromConfig : Constants.easConfig?.projectId;
  return id ? String(id) : null;
}

async function readStored(): Promise<StoredToken | null> {
  try {
    const raw = await AsyncStorage.getItem(STORED_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredToken>) : null;
    return parsed && typeof parsed.token === 'string' && typeof parsed.userId === 'string' ? { token: parsed.token, userId: parsed.userId } : null;
  } catch {
    return null;
  }
}

/** Quita del backend el token guardado (si hay) y lo olvida. Los errores se ignoran: no debe impedir nada. */
async function forgetStored(): Promise<void> {
  const stored = await readStored();
  if (!stored) return;
  await unregisterPushToken(stored.token).catch(() => undefined);
  await AsyncStorage.removeItem(STORED_KEY).catch(() => undefined);
}

let running: Promise<void> = Promise.resolve();

/**
 * Deja el registro como corresponde: con sesión (userId) y notificaciones
 * activas, registra el teléfono; si no, lo quita. Las llamadas se encadenan
 * para no pisarse.
 */
export function syncPushRegistration({ userId, enabled }: { userId: string | null; enabled: boolean }): Promise<void> {
  running = running.then(() => sync(userId, enabled)).catch(() => undefined);
  return running;
}

async function sync(userId: string | null, enabled: boolean): Promise<void> {
  if (isWeb()) {
    setState(enabled ? { status: 'unavailable', reason: 'web' } : { status: 'off' });
    return;
  }
  if (!userId || !enabled) {
    if (userId) await forgetStored();
    setState({ status: 'off' });
    return;
  }
  const projectId = pushProjectId();
  if (!projectId) {
    setState({ status: 'unavailable', reason: 'missing-project' });
    return;
  }

  setState({ status: 'registering' });
  let token: string;
  try {
    // En Android 13 los canales deben existir antes de pedir el token.
    await setupNotifications();
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Expo Go, emulador sin Google Play o sin credenciales de push.
    setState({ status: 'unavailable', reason: 'device' });
    return;
  }
  try {
    const stored = await readStored();
    // Si el teléfono tenía el token de otra cuenta, ese registro se reemplaza.
    if (stored && stored.token !== token) await unregisterPushToken(stored.token).catch(() => undefined);
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    await AsyncStorage.setItem(STORED_KEY, JSON.stringify({ token, userId } satisfies StoredToken));
    setState({ status: 'registered' });
  } catch {
    setState({ status: 'error' });
  }
}

/** Antes de cerrar sesión (con la sesión todavía válida): deja de enviar avisos a este teléfono. */
export function unregisterPushBeforeSignOut(): Promise<void> {
  running = running
    .then(async () => {
      if (!isWeb()) await forgetStored();
      setState({ status: 'off' });
    })
    .catch(() => undefined);
  return running;
}

/** Testing: vuelve al estado inicial. */
export function __resetPushRegistration(): void {
  state = { status: 'off' };
  running = Promise.resolve();
  listeners.clear();
}
