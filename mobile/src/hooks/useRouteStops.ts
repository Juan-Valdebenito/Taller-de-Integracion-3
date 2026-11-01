import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRouteStops, type RouteStop } from '../api/companyApi';
import { ApiError } from '../api/errors';

export interface UseRouteStopsResult {
  stops: RouteStop[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Paraderos de una ruta, pedidos solo cuando hay una ruta (al abrirla en la
 * lista). Si se cambia de ruta antes de que llegue la respuesta, la anterior
 * se descarta.
 */
export function useRouteStops(routeId: string | null): UseRouteStopsResult {
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setStops([]);
    setError(null);
    if (!routeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchRouteStops(routeId);
      if (id === requestId.current) setStops(result);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los paraderos.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stops, loading, error, reload };
}
