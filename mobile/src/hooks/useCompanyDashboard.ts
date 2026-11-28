import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchCompanyComplaintStats } from '../api/companyApi';
import { useAuth } from '../auth/AuthContext';
import { computeDashboardStats, type CompanyDashboardStats } from '../company/dashboardStats';
import { useCompanyOperations } from './useCompanyOperations';

export interface UseCompanyDashboardResult {
  stats: CompanyDashboardStats;
  loading: boolean;
  /** Error de micros y rutas (el de reclamos no bloquea: su tarjeta muestra "—"). */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Datos del dashboard de empresa: micros y rutas (useCompanyOperations) más
 * los reclamos pendientes de la empresa. Si los reclamos fallan, el resto del
 * dashboard se muestra igual.
 */
export function useCompanyDashboard(): UseCompanyDashboardResult {
  const { user } = useAuth();
  const operations = useCompanyOperations();
  const companyId = user?.role === 'COMPANY' ? user.companyId ?? null : null;
  const [pendingResult, setPendingResult] = useState<{ companyId: string; value: number | null } | null>(null);
  const requestId = useRef(0);

  const loadPending = useCallback(async () => {
    const id = ++requestId.current;
    if (!companyId) return;
    try {
      const stats = await fetchCompanyComplaintStats(companyId);
      if (id === requestId.current) setPendingResult({ companyId, value: stats.pending });
    } catch {
      if (id === requestId.current) setPendingResult({ companyId, value: null });
    }
  }, [companyId]);

  useEffect(() => {
    void Promise.resolve().then(loadPending);
  }, [loadPending]);

  const { refresh: refreshOperations } = operations;
  const refresh = useCallback(async () => {
    await Promise.all([refreshOperations(), loadPending()]);
  }, [refreshOperations, loadPending]);

  const pending = pendingResult?.companyId === companyId ? pendingResult.value : null;
  const loadingPending = companyId !== null && pendingResult?.companyId !== companyId;

  const stats = useMemo(
    () => computeDashboardStats(operations.buses, operations.routes, pending),
    [operations.buses, operations.routes, pending],
  );

  return { stats, loading: operations.loading || loadingPending, error: operations.error, refresh };
}
