import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchCompanies, fetchPendingComplaintsByCompany } from '../api/adminApi';
import { fetchCompanyBuses, fetchCompanyRoutes } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { buildCompanyCards, type CompanyCard } from '../admin/companies';

export interface UseAdminCompaniesResult {
  companies: CompanyCard[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Empresas de transporte con sus micros, rutas y reclamos pendientes. Las
 * empresas son obligatorias; si fallan las cifras, se muestran en cero antes
 * que ocultar la lista.
 */
export function useAdminCompanies(): UseAdminCompaniesResult {
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [list, buses, routes, pending] = await Promise.all([
        fetchCompanies(),
        fetchCompanyBuses().catch(() => []),
        fetchCompanyRoutes().catch(() => []),
        fetchPendingComplaintsByCompany().catch(() => ({})),
      ]);
      if (id === requestId.current) setCompanies(buildCompanyCards(list, buses, routes, pending));
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las empresas.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { companies, loading, error, refresh };
}
