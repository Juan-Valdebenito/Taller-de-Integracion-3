/** Datos del panel de administración en backend-go. */
import { apiRequest } from './client';
import type { UserRole } from '../auth/types';
import type { CompanyRoute } from './companyApi';

/** Estadísticas de reclamos (GET /complaints/stats), de toda la plataforma o de una empresa. */
export interface ComplaintStats {
  total: number;
  /** Calificación promedio de 1 a 5 (el web la llama "CSAT Promedio Flota"); 0 sin calificaciones. */
  averageRating: number;
  /** Porcentaje de reclamos resueltos (0 a 100). */
  resolvedPercentage: number;
  pending: number;
  inReview: number;
  resolved: number;
  rejected: number;
  byCategory: Record<string, number>;
  byLine: Record<string, number>;
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function counts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, count]) => key && typeof count === 'number' && count > 0)
      .map(([key, count]) => [key, count as number]),
  );
}

export async function fetchComplaintStats(companyId?: string): Promise<ComplaintStats> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const raw = await apiRequest<Partial<Record<string, unknown>> | null>(`/complaints/stats${query}`);
  return {
    total: num(raw?.totalComplaints),
    averageRating: num(raw?.averageRating),
    resolvedPercentage: num(raw?.resolvedPercentage),
    pending: num(raw?.pendingCount),
    inReview: num(raw?.inReviewCount),
    resolved: num(raw?.resolvedCount),
    rejected: num(raw?.rejectedCount),
    byCategory: counts(raw?.byCategory),
    byLine: counts(raw?.byLine),
  };
}

/** Empresa de transporte (GET /companies, solo ADMIN). */
export interface CompanySummary {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

/** Datos editables de una empresa (crear o editar). */
export interface CompanyInput {
  name: string;
  rut: string;
  email: string;
  phone: string | null;
  address: string | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const optional = (value: unknown) => text(value) || null;

function toCompany(raw: Partial<Record<keyof CompanySummary, unknown>>): CompanySummary | null {
  const id = text(raw.id);
  if (!id) return null;
  return {
    id,
    name: text(raw.name) || 'Empresa sin nombre',
    rut: text(raw.rut),
    email: text(raw.email),
    phone: optional(raw.phone),
    address: optional(raw.address),
    isActive: raw.isActive !== false,
  };
}

function requireCompany(raw: Partial<Record<keyof CompanySummary, unknown>> | null): CompanySummary {
  const company = toCompany(raw ?? {});
  if (!company) throw new Error('El backend no devolvió la empresa.');
  return company;
}

/** Todas las empresas (activas e inactivas) con sus datos de contacto. */
export async function fetchCompanies(): Promise<CompanySummary[]> {
  const raw = await apiRequest<Array<Partial<Record<keyof CompanySummary, unknown>>> | null>('/companies');
  return (Array.isArray(raw) ? raw : []).map((company) => toCompany(company ?? {})).filter((c): c is CompanySummary => c !== null);
}

/** Registra una empresa (queda activa). El backend valida el RUT y responde 409 si el RUT o el correo ya existen. */
export async function createCompany(input: CompanyInput): Promise<CompanySummary> {
  return requireCompany(await apiRequest('/companies', { method: 'POST', body: input }));
}

export async function updateCompany(id: string, input: CompanyInput): Promise<CompanySummary> {
  return requireCompany(await apiRequest(`/companies/${encodeURIComponent(id)}`, { method: 'PUT', body: input }));
}

/** Activa o desactiva la empresa. */
export async function setCompanyActive(id: string, isActive: boolean): Promise<CompanySummary> {
  return requireCompany(await apiRequest(`/companies/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { isActive } }));
}

/** Reclamos pendientes por empresa, con una sola consulta (GET /complaints?status=PENDING). */
export async function fetchPendingComplaintsByCompany(): Promise<Record<string, number>> {
  const raw = await apiRequest<Array<{ companyId?: unknown }> | null>('/complaints?status=PENDING');
  const counts: Record<string, number> = {};
  for (const complaint of Array.isArray(raw) ? raw : []) {
    const id = typeof complaint?.companyId === 'string' ? complaint.companyId : '';
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Datos de una ruta al crearla (POST /routes, solo ADMIN). */
export interface NewRouteInput {
  code: string;
  name: string;
  description: string | null;
  companyId: string;
}

/** Datos al editarla (PUT /routes/:id): la empresa no se puede cambiar. */
export interface RouteUpdateInput {
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export function createRoute(input: NewRouteInput): Promise<CompanyRoute> {
  return apiRequest<CompanyRoute>('/routes/', { method: 'POST', body: input });
}

export function updateRoute(id: string, input: RouteUpdateInput): Promise<CompanyRoute> {
  return apiRequest<CompanyRoute>(`/routes/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
}

/** Elimina la ruta: backend-go borra sus paraderos y deja sus micros sin ruta. */
export async function deleteRoute(id: string): Promise<void> {
  await apiRequest(`/routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Cuenta de usuario tal como la lista GET /users (sin el hash de la contraseña). */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  companyId: string | null;
  /** ISO 8601; null si el backend no lo envía. */
  createdAt: string | null;
}

const ROLES: readonly UserRole[] = ['PASSENGER', 'COMPANY', 'ADMIN'];

function toUser(raw: Partial<Record<keyof AdminUser, unknown>>): AdminUser | null {
  const id = text(raw.id);
  if (!id) return null;
  const role = ROLES.find((r) => r === raw.role) ?? 'PASSENGER';
  return {
    id,
    name: text(raw.name) || 'Sin nombre',
    email: text(raw.email),
    role,
    isActive: raw.isActive !== false,
    companyId: optional(raw.companyId),
    createdAt: optional(raw.createdAt),
  };
}

/** Todas las cuentas (pasajeros, empresas y administradores), las más nuevas primero. */
export async function fetchUsers(): Promise<AdminUser[]> {
  const raw = await apiRequest<Array<Partial<Record<keyof AdminUser, unknown>>> | null>('/users');
  return (Array.isArray(raw) ? raw : []).map((user) => toUser(user ?? {})).filter((u): u is AdminUser => u !== null);
}
