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

  const load = useCallback(
    async (mode: 'loading' | 'refreshing') => {
      const id = ++requestId.current;
      (mode === 'loading' ? setLoading : setRefreshing)(true);
      setError(null);
      try {
        const result = await fetchMyComplaints({ category, status });
        if (mounted.current && id === requestId.current) setComplaints(result);
      } catch {
        if (mounted.current && id === requestId.current) setError(LOAD_ERROR);
      } finally {
        // La última consulta apaga los dos indicadores (pudo reemplazar a otra en curso).
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [category, status],
  );

  useEffect(() => {
    load('loading');
  }, [load]);

  const refresh = useCallback(() => load('refreshing'), [load]);
  const addComplaint = useCallback((complaint: Complaint) => setComplaints((current) => [complaint, ...current]), []);

  return { complaints, loading, refreshing, error, refresh, addComplaint };
}
