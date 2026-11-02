import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import {
  LocationError,
  getCurrentPosition,
  getLocationPermission,
  requestLocationPermission,
  watchPosition,
  type LocationPermission,
  type UserPosition,
} from '../location/locationService';

export interface UseLocationResult {
  /** null mientras se consulta el permiso al montar. */
  permission: LocationPermission | null;
  position: UserPosition | null;
  /** true mientras se obtiene la posición. */
  locating: boolean;
  error: string | null;
  /** Pide el permiso (diálogo del sistema) y, si se concede, obtiene la posición. */
  requestAndLocate: () => Promise<void>;
  /** Vuelve a obtener la posición (requiere permiso concedido). */
  refresh: () => Promise<void>;
  /** Abre los ajustes de la app (para cuando el permiso quedó bloqueado). */
  openSettings: () => Promise<void>;
}

/**
 * Estado de la ubicación del usuario. Al montar solo consulta el permiso (sin
 * mostrar diálogos); si ya estaba concedido, obtiene la posición. El diálogo
 * del sistema se muestra solo cuando el usuario lo pide (requestAndLocate).
 * Con el permiso concedido sigue la posición mientras la app está en primer
 * plano, para que la verificación del paradero se mantenga al día.
 */
export function useLocation(): UseLocationResult {
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const current = await getCurrentPosition();
      if (mounted.current) setPosition(current);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof LocationError && e.code === 'permission-denied') {
        // El permiso pudo revocarse desde Ajustes mientras la app estaba abierta.
        setPermission(await getLocationPermission());
      }
      setError(e instanceof LocationError ? e.message : 'No se pudo obtener tu ubicación.');
    } finally {
      if (mounted.current) setLocating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getLocationPermission()
      .then((current) => {
        if (cancelled) return;
        setPermission(current);
        if (current === 'granted') {
          locate();
        }
      })
      .catch(() => {
        if (!cancelled) setPermission('undetermined');
      });
    return () => {
      cancelled = true;
    };
  }, [locate]);

  // Seguimiento continuo: solo con permiso y la app en primer plano.
  useEffect(() => {
    if (permission !== 'granted') return;
    let stopWatching: (() => void) | null = null;
    let wanted = false;
    let starting = false;
    let disposed = false;

    const start = () => {
      wanted = true;
      if (stopWatching || starting) return;
      starting = true;
      watchPosition(
        (next) => {
          if (!mounted.current) return;
          setPosition(next);
          setError(null);
        },
        (e) => {
          if (mounted.current) setError(e.message);
        },
      )
        .then((remove) => {
          if (disposed || !wanted) remove();
          else stopWatching = remove;
        })
        .catch(() => {
          // Sin seguimiento sigue disponible la lectura puntual (Actualizar ubicación).
        })
        .finally(() => {
          starting = false;
        });
    };
    const pause = () => {
      wanted = false;
      stopWatching?.();
      stopWatching = null;
    };

    if (AppState.currentState !== 'background') start();
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : pause()));
    return () => {
      disposed = true;
      pause();
      subscription.remove();
    };
  }, [permission]);

  const requestAndLocate = useCallback(async () => {
    setError(null);
    const result = await requestLocationPermission();
    if (!mounted.current) return;
    setPermission(result);
    if (result === 'granted') {
      await locate();
    }
  }, [locate]);

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  return { permission, position, locating, error, requestAndLocate, refresh: locate, openSettings };
}
