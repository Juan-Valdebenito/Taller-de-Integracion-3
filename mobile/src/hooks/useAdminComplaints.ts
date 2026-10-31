import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchAllComplaints, fetchCompanies, fetchComplaintStats, type ComplaintStats } from '../api/adminApi';
import { fetchCompanyBuses } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { buildComplaintRows, type AdminComplaintRow } from '../admin/complaints';

export interface UseAdminComplaintsResult {
  complaints: AdminComplaintRow[];
  /** Cifras de toda la plataforma; null si no se pudieron cargar. */
  stats: ComplaintStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Todos los reclamos con el nombre de su empresa y la patente de su micro, y
 * las cifras del encabezado. Los reclamos son obligatorios; si fallan las
 * cifras, las empresas o las micros, se muestra lo demás.
 */
export function useAdminComplaints(): UseAdminComplaintsResult {
  const [complaints, setComplaints] = useState<AdminComplaintRow[]>([]);
  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [list, statsResult, companies, buses] = await Promise.all([
        fetchAllComplaints(),
        fetchComplaintStats().catch(() => null),
        fetchCompanies().catch(() => []),
        fetchCompanyBuses().catch(() => []),
      ]);
      if (id !== requestId.current) return;
      setComplaints(buildComplaintRows(list, companies, buses));
      setStats(statsResult);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los reclamos.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { complaints, stats, loading, error, refresh };
}
