/**
 * Usuarios del sistema en el panel del administrador (funciones puras).
 * El web (AdminUsersPage) muestra usuarios de ejemplo si el backend no
 * responde; aquí siempre son los de backend-go.
 */
import type { AdminUser, CompanySummary } from '../api/adminApi';
import type { UserRole } from '../auth/types';

/** Textos y colores de rol del web: hsl(271,70%,60%), hsl(215,80%,55%), hsl(199,89%,48%). */
export const USER_ROLE: Record<UserRole, { label: string; color: string }> = {
  ADMIN: { label: 'Admin', color: '#9b52e0' },
  COMPANY: { label: 'Empresa', color: '#307de8' },
  PASSENGER: { label: 'Pasajero', color: '#0ea5e9' },
};

export interface AdminUserRow extends AdminUser {
  /** Nombre de la empresa (el web muestra el id); null si no tiene. */
  companyName: string | null;
  initials: string;
  /** Fecha de registro, "dd-mm-aaaa"; "—" si no se conoce. */
  registered: string;
}

/** Iniciales de las dos primeras palabras del nombre, como el avatar del web. */
export function userInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return initials || '?';
}

/** Fecha local "dd-mm-aaaa" a partir de un ISO 8601. */
export function formatRegistered(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function buildUserRows(users: readonly AdminUser[], companies: readonly CompanySummary[]): AdminUserRow[] {
  const names = new Map(companies.map((company) => [company.id, company.name]));
  return users.map((user) => ({
    ...user,
    companyName: user.companyId ? (names.get(user.companyId) ?? user.companyId) : null,
    initials: userInitials(user.name),
    registered: formatRegistered(user.createdAt),
  }));
}

export type UserRoleFilter = UserRole | 'ALL';
export type UserStatusFilter = 'ALL' | 'active' | 'inactive';

export interface UserFilters {
  search: string;
  role: UserRoleFilter;
  status: UserStatusFilter;
}

export const EMPTY_USER_FILTERS: UserFilters = { search: '', role: 'ALL', status: 'ALL' };

/** Opciones de los filtros, con los textos del web. */
export const USER_ROLE_OPTIONS: readonly { value: UserRoleFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los roles' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'COMPANY', label: 'Empresa' },
  { value: 'PASSENGER', label: 'Pasajero' },
];

export const USER_STATUS_OPTIONS: readonly { value: UserStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
];

/** Busca por nombre o correo (como el web) y también por empresa, sin importar mayúsculas ni tildes. */
export function filterUsers(rows: readonly AdminUserRow[], filters: UserFilters): AdminUserRow[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = normalize(filters.search.trim());
  return rows.filter((row) => {
    if (filters.role !== 'ALL' && row.role !== filters.role) return false;
    if (filters.status === 'active' && !row.isActive) return false;
    if (filters.status === 'inactive' && row.isActive) return false;
    if (!term) return true;
    return [row.name, row.email, row.companyName ?? ''].some((field) => normalize(field).includes(term));
  });
}

/** Cifras de los chips del encabezado: cuántos hay de cada rol y cuántos inactivos. */
export function countUsers(users: readonly AdminUser[]): Record<UserRole, number> & { inactive: number } {
  return {
    ADMIN: users.filter((user) => user.role === 'ADMIN').length,
    COMPANY: users.filter((user) => user.role === 'COMPANY').length,
    PASSENGER: users.filter((user) => user.role === 'PASSENGER').length,
    inactive: users.filter((user) => !user.isActive).length,
  };
}
