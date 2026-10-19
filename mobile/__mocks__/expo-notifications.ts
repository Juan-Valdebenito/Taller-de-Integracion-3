/**
 * Mock de expo-notifications para Jest (en los tests no hay sistema de
 * notificaciones). Por defecto el permiso está concedido; cada test puede
 * cambiarlo con mockResolvedValueOnce(__permission(...)).
 */
export const PermissionStatus = {
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
} as const;

export const IosAuthorizationStatus = {
  NOT_DETERMINED: 0,
  DENIED: 1,
  AUTHORIZED: 2,
  PROVISIONAL: 3,
  EPHEMERAL: 4,
} as const;

export const AndroidImportance = { DEFAULT: 5, HIGH: 6, MAX: 7 } as const;

/** Respuesta de permiso como la entrega expo-notifications. */
export function __permission(status: 'granted' | 'undetermined' | 'denied', canAskAgain = true) {
  return { status, granted: status === 'granted', canAskAgain, expires: 'never' };
}

export const getPermissionsAsync = jest.fn(async () => __permission('granted'));
export const requestPermissionsAsync = jest.fn(async () => __permission('granted'));
export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(async () => null);
export const scheduleNotificationAsync = jest.fn(async () => 'notification-id');
