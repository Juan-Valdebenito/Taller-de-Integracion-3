import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchCompanies, type CompanySummary } from '../api/adminApi';
import { fetchCompanyBuses, fetchCompanyRoutes } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { buildRouteRows, type AdminRouteRow } from '../admin/routes';

export interface UseAdminRoutesResult {
  routes: AdminRouteRow[];
  companies: CompanySummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Rutas de todas las empresas con sus micros y el nombre de su empresa. Las
 * rutas son obligatorias; si fallan las empresas o las micros, la lista se
 * muestra igual (con el id de la empresa y sin micros).
 */
export function useAdminRoutes(): UseAdminRoutesResult {
  const [routes, setRoutes] = useState<AdminRouteRow[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [routeList, buses, companyList] = await Promise.all([
        fetchCompanyRoutes(),
        fetchCompanyBuses().catch(() => []),
        fetchCompanies().catch(() => []),
      ]);
      if (id !== requestId.current) return;
      setRoutes(buildRouteRows(routeList, buses, companyList));
      setCompanies(companyList);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las rutas desde el backend.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { routes, companies, loading, error, refresh };
}
