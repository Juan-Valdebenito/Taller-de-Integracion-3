/**
 * Listado de reclamos del administrador (funciones puras), con los filtros,
 * textos y colores de AdminComplaintsView del web.
 */
import type { CompanySummary } from '../api/adminApi';
import type { CompanyBus } from '../api/companyApi';
import type { Complaint, ComplaintStatus } from '../api/complaintsApi';
import { formatLongDate } from '../utils/format';

/** Etiqueta y colores de cada estado (STATUS_CONFIG del web). */
export const ADMIN_STATUS: Readonly<Record<ComplaintStatus, { label: string; bg: string; color: string; border: string }>> = {
  PENDING: { label: 'PENDIENTE', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: 'rgba(234, 179, 8, 0.4)' },
  IN_REVIEW: { label: 'EN REVISIÓN', bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' },
  RESOLVED: { label: 'RESUELTO', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' },
  REJECTED: { label: 'RECHAZADO', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)' },
};

export const adminStatus = (status: string) =>
  ADMIN_STATUS[status as ComplaintStatus] ?? { label: status, bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.4)' };

export interface AdminComplaintRow extends Complaint {
  /** Primeros 8 caracteres del id, como la columna ID del web. */
  shortId: string;
  /** Nombre de la empresa; su id si no está en la lista; null si no tiene. */
  companyName: string | null;
  /** Patente de la micro; su id si no está en la lista; null si no tiene. */
  busPlate: string | null;
  /** "16 de octubre de 2026"; "" si no se conoce. */
  date: string;
}

export function buildComplaintRows(complaints: readonly Complaint[], companies: readonly CompanySummary[], buses: readonly CompanyBus[]): AdminComplaintRow[] {
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const plates = new Map(buses.map((bus) => [bus.id, bus.patente]));
  return complaints.map((complaint) => ({
    ...complaint,
    shortId: complaint.id.length > 10 ? complaint.id.slice(0, 8) : complaint.id,
    companyName: complaint.companyId ? (companyNames.get(complaint.companyId) ?? complaint.companyId) : null,
    busPlate: complaint.busId ? (plates.get(complaint.busId) ?? complaint.busId) : null,
    date: formatLongDate(complaint.createdAt),
  }));
}

export interface AdminComplaintFilters {
  line: string;
  status: string;
  category: string;
  search: string;
}

export const EMPTY_COMPLAINT_FILTERS: AdminComplaintFilters = { line: 'ALL', status: 'ALL', category: 'ALL', search: '' };

/** Opciones de los filtros, en el orden y con los textos del web. */
export const LINE_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todas las líneas' },
  { value: '7A', label: 'Línea 7A' },
  { value: '7B', label: 'Línea 7B' },
  { value: '1C', label: 'Línea 1C' },
];

export const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'IN_REVIEW', label: 'En Revisión' },
  { value: 'RESOLVED', label: 'Resueltos' },
  { value: 'REJECTED', label: 'Rechazados' },
];

export const CATEGORY_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todas las categorías' },
  { value: 'OVERCROWDING', label: '⚠️ Sobrecupo / Aforo' },
  { value: 'DELAY', label: '⏱️ Retraso / Demora' },
  { value: 'DRIVER_BEHAVIOR', label: '🛑 Conducción Imprudente' },
  { value: 'FARES_PAYMENT', label: '💳 Pago de Tarifa / Bipay' },
  { value: 'VEHICLE_CONDITION', label: '🧹 Estado del Vehículo' },
  { value: 'ACCESSIBILITY', label: '♿ Accesibilidad' },
  { value: 'OTHER', label: 'ℹ️ Otro' },
];

/**
 * Filtra como el web (línea, estado, categoría y búsqueda por id, título,
 * descripción o micro), y además busca por patente y empresa, sin importar
 * mayúsculas ni tildes.
 */
export function filterComplaints(rows: readonly AdminComplaintRow[], filters: AdminComplaintFilters): AdminComplaintRow[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = normalize(filters.search.trim());
  return rows.filter((row) => {
    if (filters.line !== 'ALL' && !(row.lineName ?? '').toUpperCase().includes(filters.line.toUpperCase())) return false;
    if (filters.status !== 'ALL' && row.status !== filters.status) return false;
    if (filters.category !== 'ALL' && row.category !== filters.category) return false;
    if (!term) return true;
    return [row.id, row.title, row.description, row.busId ?? '', row.busPlate ?? '', row.companyName ?? ''].some((field) => normalize(field).includes(term));
  });
}
