import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { fetchCompanyBuses, fetchCompanyRoutes, type CompanyBus, type CompanyRoute } from '../api/companyApi';
import { useAuth } from '../auth/AuthContext';

export function useCompanyOperations() {
  const { user } = useAuth();
  const [buses, setBuses] = useState<CompanyBus[]>([]);
  const [routes, setRoutes] = useState<CompanyRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (user?.role !== 'COMPANY' && user?.role !== 'ADMIN') {
      setBuses([]);
      setRoutes([]);
      setLoading(false);
      return;
    }
    if (user.role === 'COMPANY' && !user.companyId) {
      setBuses([]);
      setRoutes([]);
      setError('La cuenta no está asociada a una empresa. Contacta a un administrador.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [allBuses, allRoutes] = await Promise.all([
        fetchCompanyBuses(user?.companyId),
        fetchCompanyRoutes(),
      ]);
      const companyId = user?.companyId;
      setBuses(companyId ? allBuses.filter((bus) => bus.companyId === companyId) : allBuses);
      setRoutes(companyId ? allRoutes.filter((route) => route.companyId === companyId) : allRoutes);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar la información de la empresa.');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { buses, routes, loading, error, refresh };
}
