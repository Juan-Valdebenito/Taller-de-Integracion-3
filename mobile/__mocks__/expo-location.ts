/**
 * Mock de expo-location para Jest (en los tests no hay GPS ni diálogos de
 * permisos). Jest lo usa automáticamente en lugar del módulo real; cada test
 * configura las respuestas con mockResolvedValue.
 */
export const PermissionStatus = {
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
} as const;

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
} as const;

export const getForegroundPermissionsAsync = jest.fn();
export const requestForegroundPermissionsAsync = jest.fn();
export const hasServicesEnabledAsync = jest.fn();
export const getCurrentPositionAsync = jest.fn();
export const getLastKnownPositionAsync = jest.fn();
export const watchPositionAsync = jest.fn();

/** Respuesta de permiso como la entrega expo-location. */
export function __permission(status: 'granted' | 'undetermined' | 'denied', canAskAgain = true) {
  return { status, granted: status === 'granted', canAskAgain, expires: 'never' };
}

/** LocationObject como lo entrega expo-location. */
export function __location(latitude: number, longitude: number, accuracy: number | null = 12, timestamp = 1_700_000_000_000) {
  return {
    coords: { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp,
  };
}
