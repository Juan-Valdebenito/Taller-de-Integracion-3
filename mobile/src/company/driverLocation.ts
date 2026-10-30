/**
 * Posición de la micro que envía el modo conductor (funciones puras): rumbo y
 * velocidad calculados entre dos posiciones seguidas del GPS, y el mensaje
 * "publish" que espera el WebSocket de backend-go.
 */
import type { CompanyBus } from '../api/companyApi';
import { distanceInMeters, type Coordinates } from '../location/geo';
import type { PublishMessage } from '../realtime/types';

export interface TimedPosition extends Coordinates {
  /** ms desde 1970. */
  timestamp: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Rumbo de `from` a `to` en grados (0 = norte, 90 = este). */
export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Por debajo de esto (m) se considera que la micro no se movió (ruido del GPS). */
export const MIN_MOVE_M = 5;

/**
 * Rumbo y velocidad (km/h) desde la posición anterior. Si casi no se movió,
 * la velocidad es 0 y se mantiene el rumbo anterior (así el ícono no gira solo).
 */
export function motionBetween(
  previous: TimedPosition | null,
  current: TimedPosition,
  previousHeading = 0,
): { heading: number; speed: number } {
  if (!previous) return { heading: previousHeading, speed: 0 };
  const meters = distanceInMeters(previous, current);
  const seconds = (current.timestamp - previous.timestamp) / 1000;
  if (meters < MIN_MOVE_M || seconds <= 0) return { heading: previousHeading, speed: 0 };
  return { heading: Math.round(bearingDegrees(previous, current)), speed: Math.round((meters / seconds) * 3.6) };
}

export function buildPublishMessage(
  token: string,
  bus: Pick<CompanyBus, 'id' | 'currentPassengers' | 'capacity'>,
  routeId: string,
  position: Coordinates,
  motion: { heading: number; speed: number },
): PublishMessage {
  return {
    type: 'publish',
    token,
    data: {
      busId: bus.id,
      routeId,
      latitude: position.latitude,
      longitude: position.longitude,
      heading: motion.heading,
      speed: motion.speed,
      currentPassengers: bus.currentPassengers,
      capacity: bus.capacity,
    },
  };
}
