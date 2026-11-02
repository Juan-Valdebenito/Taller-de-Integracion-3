import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchComplaintStats, type ComplaintStats } from '../api/adminApi';
import { ApiError } from '../api/errors';

export interface UseAdminDashboardResult {
  /** null hasta cargar (o si falló la primera carga). */
  stats: ComplaintStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Estadísticas de reclamos de toda la plataforma para el dashboard del
 * administrador. Si una recarga falla se conservan los últimos datos.
 */
export function useAdminDashboard(): UseAdminDashboardResult {
  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchComplaintStats();
      if (id === requestId.current) setStats(result);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las estadísticas de reclamos.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}
