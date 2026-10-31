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
