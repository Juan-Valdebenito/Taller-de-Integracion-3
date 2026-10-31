/** Datos del panel de administración en backend-go. */
import { apiRequest } from './client';

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

/** Empresa tal como la entrega GET /companies (backend-go solo envía estos campos, y solo las activas). */
export interface CompanySummary {
  id: string;
  name: string;
  isActive: boolean;
}

/** Empresas de transporte (solo ADMIN). */
export async function fetchCompanies(): Promise<CompanySummary[]> {
  const raw = await apiRequest<Array<Partial<CompanySummary>> | null>('/companies');
  return (Array.isArray(raw) ? raw : [])
    .filter((company) => company?.id)
    .map((company) => ({ id: String(company.id), name: String(company.name ?? '').trim() || 'Empresa sin nombre', isActive: company.isActive !== false }));
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
