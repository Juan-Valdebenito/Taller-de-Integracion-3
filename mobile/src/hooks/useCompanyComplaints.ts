import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchCompanyComplaints, type Complaint, type ComplaintFilters } from '../api/complaintsApi';

export const COMPANY_COMPLAINTS_LOAD_ERROR = 'Error al cargar los reclamos de la empresa';

/** Carga los reclamos de una empresa y evita que una respuesta antigua reemplace a la más reciente. */
export function useCompanyComplaints(companyId: string | null | undefined, { category = '', status = '' }: ComplaintFilters = {}) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (mode: 'loading' | 'refreshing') => {
    const id = ++requestId.current;
    if (!companyId) {
      setComplaints([]);
      setError('La cuenta no está asociada a una empresa. Contacta a un administrador.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    (mode === 'loading' ? setLoading : setRefreshing)(true);
    setError(null);
    try {
      const result = await fetchCompanyComplaints(companyId, { category, status });
      if (mounted.current && id === requestId.current) setComplaints(result);
    } catch {
      if (mounted.current && id === requestId.current) setError(COMPANY_COMPLAINTS_LOAD_ERROR);
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, companyId, status]);

  useEffect(() => {
    void load('loading');
  }, [load]);

  return { complaints, loading, refreshing, error, refresh: useCallback(() => load('refreshing'), [load]) };
}
