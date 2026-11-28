import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMyComplaints, type Complaint, type ComplaintFilters } from '../api/complaintsApi';

/** Mensaje del web cuando falla la carga. */
export const LOAD_ERROR = 'Error al cargar los reclamos';

export interface UseMyComplaintsResult {
  complaints: Complaint[];
  /** Primera carga o carga tras cambiar un filtro (el web muestra "Cargando reclamos..."). */
  loading: boolean;
  /** Recarga pedida por el usuario (deslizar hacia abajo), sin ocultar la lista. */
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Agrega al inicio un reclamo recién creado, como hace el web al enviar el formulario. */
  addComplaint: (complaint: Complaint) => void;
}

/**
 * "Mis reclamos" del pasajero, como PassengerComplaintsPage del web: se vuelven
 * a pedir al backend cada vez que cambia un filtro. Si llegan respuestas fuera
 * de orden (cambios rápidos de filtro), solo cuenta la última.
 */
export function useMyComplaints({ category = '', status = '' }: ComplaintFilters = {}): UseMyComplaintsResult {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [settledQuery, setSettledQuery] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ query: string; message: string } | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const query = JSON.stringify([category, status]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAutomatically = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fetchMyComplaints({ category, status });
      if (mounted.current && id === requestId.current) setComplaints(result);
      if (mounted.current && id === requestId.current) setLoadError(null);
    } catch {
      if (mounted.current && id === requestId.current) setLoadError({ query, message: LOAD_ERROR });
    } finally {
      if (mounted.current && id === requestId.current) setSettledQuery(query);
    }
  }, [category, query, status]);

  const loadManually = useCallback(
    async () => {
      const id = ++requestId.current;
      setRefreshing(true);
      setLoadError(null);
      try {
        const result = await fetchMyComplaints({ category, status });
        if (mounted.current && id === requestId.current) setComplaints(result);
      } catch {
        if (mounted.current && id === requestId.current) setLoadError({ query, message: LOAD_ERROR });
      } finally {
        if (mounted.current && id === requestId.current) {
          setRefreshing(false);
          setSettledQuery(query);
        }
      }
    },
    [category, query, status],
  );

  useEffect(() => {
    void Promise.resolve().then(loadAutomatically);
  }, [loadAutomatically]);

  const refresh = useCallback(() => loadManually(), [loadManually]);
  const addComplaint = useCallback((complaint: Complaint) => setComplaints((current) => [complaint, ...current]), []);
  const loading = settledQuery !== query;
  const error = loadError?.query === query ? loadError.message : null;

  return { complaints, loading, refreshing, error, refresh, addComplaint };
}
