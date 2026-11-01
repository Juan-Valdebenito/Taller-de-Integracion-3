import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchCompanies, fetchUsers, type CompanySummary } from '../api/adminApi';
import { ApiError } from '../api/errors';
import { buildUserRows, type AdminUserRow } from '../admin/users';

export interface UseAdminUsersResult {
  users: AdminUserRow[];
  companies: CompanySummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Cuentas del sistema con el nombre de su empresa. Los usuarios son
 * obligatorios; si fallan las empresas, se muestra su id (como el web).
 */
export function useAdminUsers(): UseAdminUsersResult {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [list, companyList] = await Promise.all([fetchUsers(), fetchCompanies().catch(() => [])]);
      if (id !== requestId.current) return;
      setUsers(buildUserRows(list, companyList));
      setCompanies(companyList);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los usuarios.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { users, companies, loading, error, refresh };
}
