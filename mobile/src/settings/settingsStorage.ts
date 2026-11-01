/**
 * Preferencias del pasajero guardadas en el teléfono (AsyncStorage).
 *
 * No son datos sensibles, por eso no van en SecureStore como los tokens. Son
 * del dispositivo: se mantienen al cerrar la app y al cerrar sesión.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type TextSizePreference = 'normal' | 'large' | 'extraLarge';

export interface Settings {
  /** Notificaciones push (alertas de proximidad como notificación del teléfono). */
  notificationsEnabled: boolean;
  /** Vibrar al recibir una alerta de proximidad. */
  vibrationEnabled: boolean;
  /** Tema de la interfaz: el del sistema, claro u oscuro. */
  theme: ThemePreference;
  /** Tamaño del texto de la app. */
  textSize: TextSizePreference;
}

/**
 * Valores por defecto. Las notificaciones empiezan desactivadas: se activan
 * solo cuando el pasajero lo decide (y concede el permiso).
 */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  notificationsEnabled: false,
  vibrationEnabled: true,
  // Oscuro, como el frontend web (que siempre es oscuro).
  theme: 'dark',
  textSize: 'normal',
});

export const SETTINGS_KEY = 'transithub.settings';

/** Versión del formato guardado, por si cambia en el futuro. */
const SETTINGS_VERSION = 1;

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const TEXT_SIZES: readonly TextSizePreference[] = ['normal', 'large', 'extraLarge'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Lee las preferencias guardadas validando campo por campo: un valor dañado o
 * desconocido (ej. de otra versión de la app) vuelve a su valor por defecto
 * sin perder el resto.
 */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
  const value = data as Record<string, unknown>;
  return {
    notificationsEnabled: bool(value.notificationsEnabled, DEFAULT_SETTINGS.notificationsEnabled),
    vibrationEnabled: bool(value.vibrationEnabled, DEFAULT_SETTINGS.vibrationEnabled),
    theme: pick(value.theme, THEMES, DEFAULT_SETTINGS.theme),
    textSize: pick(value.textSize, TEXT_SIZES, DEFAULT_SETTINGS.textSize),
  };
}

/** Preferencias guardadas; si no hay o no se pueden leer, las de por defecto. */
export async function loadSettings(): Promise<Settings> {
  try {
    return parseSettings(await AsyncStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...settings }));
}
