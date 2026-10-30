import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompanyBus } from '../api/companyApi';
import { renewIfExpiringSoon } from '../api/interceptor';
import { buildPublishMessage, motionBetween, type TimedPosition } from '../company/driverLocation';
import type { Coordinates } from '../location/geo';
import { requestLocationPermission, watchPosition } from '../location/locationService';
import { RealtimeClient } from '../realtime/RealtimeClient';
import type { ConnectionStatus } from '../realtime/types';
import { resolveWsUrl } from '../realtime/wsUrl';
import { getAccessToken } from '../storage/tokenStorage';

/** Cada cuánto se toma la posición en recorrido (más seguido que para el pasajero). */
export const DRIVER_WATCH_INTERVAL_MS = 5_000;
export const DRIVER_WATCH_DISTANCE_M = 10;

/**
 * Con la micro detenida el GPS no entrega posiciones nuevas: cada tanto se
 * reenvía la última (velocidad 0) para que un pasajero que abre el mapa
 * después la vea igual.
 */
export const DRIVER_HEARTBEAT_MS = 5_000;

export type DriverLocationStatus = 'idle' | 'starting' | 'tracking' | 'denied' | 'error';

export interface DriverLocationState {
  status: DriverLocationStatus;
  /** Última posición del GPS (para el avance del recorrido). */
  position: Coordinates | null;
  connection: ConnectionStatus;
  /** Última vez que se envió la posición (ms). */
  lastSentAt: number | null;
  sentCount: number;
  /** Motivo si no se puede seguir la posición o el servidor rechaza el envío. */
  error: string | null;
  /** Vuelve a pedir el permiso y a empezar (tras "denied" o "error"). */
  retry: () => void;
}

export interface UseDriverLocationOptions {
  createClient?: () => RealtimeClient;
}

/**
 * Mientras hay un recorrido activo: sigue el GPS del teléfono y publica cada
 * posición de la micro por el WebSocket de backend-go, que la reenvía a los
 * pasajeros suscritos a esa ruta. Al terminar el recorrido se detiene todo.
 */
export function useDriverLocation(
  trip: { bus: CompanyBus; route: { id: string } } | null,
  { createClient = () => new RealtimeClient(resolveWsUrl()) }: UseDriverLocationOptions = {},
): DriverLocationState {
  const [status, setStatus] = useState<DriverLocationStatus>('idle');
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const createClientRef = useRef(createClient);
  // La micro al día (pasajeros) sin reiniciar el seguimiento cada vez que cambia.
  const busRef = useRef(trip?.bus ?? null);
  busRef.current = trip?.bus ?? null;

  const busId = trip?.bus.id ?? null;
  const routeId = trip?.route.id ?? null;

  useEffect(() => {
    if (!busId || !routeId) {
      setStatus('idle');
      setPosition(null);
      setLastSentAt(null);
      setSentCount(0);
      setError(null);
      return;
    }
    let active = true;
    let stopWatching: (() => void) | null = null;
    let previous: TimedPosition | null = null;
    let last: TimedPosition | null = null;
    let lastSent = 0;
    let heading = 0;
    const client = createClientRef.current();
    const offStatus = client.onStatus(setConnection);
    const offMessage = client.onMessage((msg) => {
      if (msg.type === 'error' && active) setError(`El servidor no aceptó la ubicación: ${msg.message}`);
    });
    client.connect();

    const heartbeat = setInterval(() => {
      if (last && Date.now() - lastSent >= DRIVER_HEARTBEAT_MS) void send({ ...last, timestamp: Date.now() });
    }, DRIVER_HEARTBEAT_MS);

    const send = async (current: TimedPosition) => {
      const motion = motionBetween(previous, current, heading);
      previous = current;
      last = current;
      lastSent = Date.now();
      heading = motion.heading;
      await renewIfExpiringSoon();
      const token = await getAccessToken();
      const bus = busRef.current;
      if (!active || !token || !bus) return;
      if (client.publish(buildPublishMessage(token, bus, routeId, current, motion))) {
        setLastSentAt(Date.now());
        setSentCount((count) => count + 1);
      }
    };

    (async () => {
      setStatus('starting');
      setError(null);
      const permission = await requestLocationPermission();
      if (!active) return;
      if (permission !== 'granted') {
        setStatus('denied');
        setError('Activa el permiso de ubicación para que los pasajeros vean la micro en el mapa.');
        return;
      }
      try {
        const stop = await watchPosition(
          (p) => {
            if (!active) return;
            const current = { latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp };
            setPosition({ latitude: p.latitude, longitude: p.longitude });
            setStatus('tracking');
            void send(current);
          },
          () => {
            if (active) setError('No se pudo obtener la ubicación del teléfono.');
          },
          { timeIntervalMs: DRIVER_WATCH_INTERVAL_MS, distanceIntervalM: DRIVER_WATCH_DISTANCE_M, highAccuracy: true },
        );
        if (active) stopWatching = stop;
        else stop();
      } catch {
        if (!active) return;
        setStatus('error');
        setError('No se pudo obtener la ubicación del teléfono. Revisa que el GPS esté activado.');
      }
    })();

    return () => {
      active = false;
      clearInterval(heartbeat);
      stopWatching?.();
      offStatus();
      offMessage();
      client.disconnect();
      setConnection('disconnected');
    };
  }, [busId, routeId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, position, connection, lastSentAt, sentCount, error, retry };
}
