import { useEffect, useState } from 'react';

import { startBackgroundTracking, stopBackgroundTracking, type BackgroundTrackingStatus } from '../company/backgroundTracking';

/**
 * Mientras haya un recorrido activo, mantiene el envío de la ubicación en
 * segundo plano; al terminar (o salir de la pantalla) lo detiene.
 */
export function useBackgroundTracking(trip: { bus: { id: string }; route: { id: string } } | null): BackgroundTrackingStatus {
  const [status, setStatus] = useState<BackgroundTrackingStatus>('off');
  const busId = trip?.bus.id ?? null;
  const routeId = trip?.route.id ?? null;

  useEffect(() => {
    if (!busId || !routeId) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    void startBackgroundTracking({ busId, routeId }).then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
      void stopBackgroundTracking();
    };
  }, [busId, routeId]);

  return status;
}
