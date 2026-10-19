import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';

import {
  alertMessage,
  alertStop,
  alertsPausedReason,
  findApproachingBuses,
  nextAlerts,
  type ApproachingBus,
  type ProximityAlert,
} from '../alerts/proximityAlerts';
import { fetchActiveBuses } from '../api/busesApi';
import { notifyProximityAlert } from '../notifications/notificationService';
import { ALERT_RADIUS_M, BUS_LOCATION_MAX_AGE_MS, BUS_POLL_INTERVAL_MS } from '../config';
import type { ProximityResult, Stop } from '../location/geo';

export interface ProximityAlertOptions {
  /** Vibrar con cada alerta nueva (preferencia "Vibración"). Por defecto sí. */
  vibrate?: boolean;
  /** Mostrar además una notificación del teléfono (preferencia "Notificaciones push"). Por defecto no. */
  notify?: boolean;
}

export interface UseProximityAlertsResult {
  /** true solo si la geolocalización confirmó que el usuario está en un paradero. */
  enabled: boolean;
  /** Motivo por el que las alertas están en pausa (null si están activas). */
  pausedReason: string | null;
  /** Paradero vigilado cuando las alertas están activas. */
  stop: Stop | null;
  /** Micros dentro del radio de alerta, la más cercana primero. */
  approaching: ApproachingBus[];
  /** Última alerta emitida, hasta que el usuario la descarte. */
  alert: ProximityAlert | null;
  dismissAlert: () => void;
  loading: boolean;
  error: string | null;
  /** Consulta las micros ahora (sin esperar al siguiente ciclo). */
  checkNow: () => Promise<void>;
}

/**
 * Alertas de proximidad de micros, condicionadas a la verificación de
 * geolocalización: mientras el usuario no esté dentro del radio de un paradero
 * oficial no se consultan las micros ni se emiten alertas. Con el paradero
 * confirmado, consulta las posiciones cada BUS_POLL_INTERVAL_MS (solo con la
 * app en primer plano) y alerta una vez por micro que entra al radio.
 */
export function useProximityAlerts(
  proximity: ProximityResult | null,
  { vibrate = true, notify = false }: ProximityAlertOptions = {},
): UseProximityAlertsResult {
  const stop = alertStop(proximity);
  const stopId = stop?.id ?? null;
  const [approaching, setApproaching] = useState<ApproachingBus[]>([]);
  const [alert, setAlert] = useState<ProximityAlert | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Paradero vigente; las consultas en curso de otro paradero se descartan. */
  const stopRef = useRef<Stop | null>(stop);
  stopRef.current = stop;
  const notified = useRef<Set<string>>(new Set());
  /** Preferencias vigentes, leídas al emitir la alerta (sin reiniciar la consulta periódica). */
  const options = useRef({ vibrate, notify });
  options.current = { vibrate, notify };
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Consulta de micros en curso (candado). */
  const inFlight = useRef<{ stopId: string; promise: Promise<void> } | null>(null);

  /** Consulta las micros y emite la alerta si alguna acaba de entrar al radio. */
  const runCheck = useCallback(async (current: Stop) => {
    try {
      const buses = await fetchActiveBuses();
      if (!mounted.current || stopRef.current?.id !== current.id) return;
      const list = findApproachingBuses(current, buses, {
        alertRadiusMeters: ALERT_RADIUS_M,
        maxAgeMs: BUS_LOCATION_MAX_AGE_MS,
        now: Date.now(),
      });
      const { fresh, notified: next } = nextAlerts(list, notified.current);
      notified.current = next;
      setApproaching(list);
      setError(null);
      if (fresh.length > 0) {
        const next = { ...fresh[0], stop: current, message: alertMessage(current, fresh[0]) };
        setAlert(next);
        const { vibrate: shouldVibrate, notify: shouldNotify } = options.current;
        if (shouldNotify) {
          // La notificación ya vibra según su canal; no se vibra dos veces.
          notifyProximityAlert(next, { vibrate: shouldVibrate }).catch(() => {
            if (shouldVibrate) Vibration.vibrate();
          });
        } else if (shouldVibrate) {
          Vibration.vibrate();
        }
      }
    } catch {
      if (mounted.current && stopRef.current?.id === current.id) {
        setError('No se pudieron consultar las micros cercanas.');
      }
    }
  }, []);

  /**
   * Candado: con red lenta una consulta puede durar más que el intervalo de 15 s.
   * Si ya hay una en curso para el mismo paradero no se lanza otra: se devuelve
   * la que está en curso (el botón "Buscar micros ahora" también la espera).
   */
  const check = useCallback((): Promise<void> => {
    const current = stopRef.current;
    if (!current) return Promise.resolve();
    if (inFlight.current?.stopId === current.id) return inFlight.current.promise;

    setLoading(true);
    const promise = runCheck(current).finally(() => {
      if (inFlight.current?.promise !== promise) return;
      inFlight.current = null;
      if (mounted.current) setLoading(false);
    });
    inFlight.current = { stopId: current.id, promise };
    return promise;
  }, [runCheck]);

  useEffect(() => {
    notified.current = new Set();
    setApproaching([]);
    setAlert(null);
    setError(null);
    if (!stopId) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer) return;
      check();
      timer = setInterval(check, BUS_POLL_INTERVAL_MS);
    };
    const pause = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    if (AppState.currentState !== 'background') start();
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : pause()));
    return () => {
      pause();
      subscription.remove();
    };
  }, [stopId, check]);

  const dismissAlert = useCallback(() => setAlert(null), []);

  return {
    enabled: stop !== null,
    pausedReason: alertsPausedReason(proximity),
    stop,
    approaching,
    alert,
    dismissAlert,
    loading,
    error,
    checkNow: check,
  };
}
