/**
 * Reclamos del pasajero en backend-go: GET /api/v1/complaints/my-complaints
 * (solo rol PASSENGER), con los mismos filtros y textos que el web
 * (frontend/src/presentation/pages/passenger/PassengerComplaintsPage.tsx).
 */
import { apiRequest } from './client';

export type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

export type ComplaintCategory =
  | 'DELAY'
  | 'OVERCROWDING'
  | 'DRIVER_BEHAVIOR'
  | 'FARES_PAYMENT'
  | 'VEHICLE_CONDITION'
  | 'ACCESSIBILITY'
  | 'OTHER';

export interface Complaint {
  id: string;
  title: string;
  description: string;
  /** Texto libre: el backend puede sumar categorías nuevas. */
  category: string;
  status: ComplaintStatus;
  busId: string | null;
  routeId: string | null;
  companyId: string | null;
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Nombre de cada categoría en las tarjetas, como el web. */
export const CATEGORY_LABELS: Readonly<Record<ComplaintCategory, string>> = {
  DELAY: 'Retraso',
  OVERCROWDING: 'Exceso de pasajeros',
  DRIVER_BEHAVIOR: 'Comportamiento del conductor',
  // El web no la nombra (muestra el código); el backend sí la acepta.
  FARES_PAYMENT: 'Tarifas y pagos',
  VEHICLE_CONDITION: 'Condición del vehículo',
  ACCESSIBILITY: 'Accesibilidad',
  OTHER: 'Otro',
};

/** Opciones de los selectores de categoría, en el orden y con los textos del web. */
export const CATEGORY_OPTIONS: readonly { value: ComplaintCategory; label: string }[] = [
  { value: 'DELAY', label: 'Retraso' },
  { value: 'OVERCROWDING', label: 'Exceso de pasajeros' },
  { value: 'DRIVER_BEHAVIOR', label: 'Comportamiento del conductor' },
  { value: 'VEHICLE_CONDITION', label: 'Estado del vehículo' },
  { value: 'ACCESSIBILITY', label: 'Accesibilidad' },
  { value: 'OTHER', label: 'Otro' },
];

export const STATUS_LABELS: Readonly<Record<ComplaintStatus, string>> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelto',
  REJECTED: 'Rechazado',
};

export const STATUS_OPTIONS: readonly { value: ComplaintStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as ComplaintStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Texto de la categoría; si el backend manda una desconocida se muestra tal cual (como el web). */
export const categoryLabel = (category: string) => CATEGORY_LABELS[category as ComplaintCategory] ?? category;

export const statusLabel = (status: string) => STATUS_LABELS[status as ComplaintStatus] ?? status;

export interface ComplaintFilters {
  /** '' o ausente = todas. */
  category?: ComplaintCategory | '';
  status?: ComplaintStatus | '';
}

/** Normaliza un reclamo de la respuesta; null si no trae id. */
function toComplaint(raw: Partial<Record<keyof Complaint, unknown>>): Complaint | null {
  const id = String(raw.id ?? '');
  if (!id) return null;
  const optional = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  return {
    id,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    category: String(raw.category ?? ''),
    status: String(raw.status ?? 'PENDING') as ComplaintStatus,
    busId: optional(raw.busId),
    routeId: optional(raw.routeId),
    companyId: optional(raw.companyId),
    adminResponse: optional(raw.adminResponse),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

/** Reclamos del pasajero con sesión iniciada, filtrados por categoría y estado. */
export async function fetchMyComplaints({ category = '', status = '' }: ComplaintFilters = {}): Promise<Complaint[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  const query = params.toString();
  const response = await apiRequest<unknown[] | null>(`/complaints/my-complaints${query ? `?${query}` : ''}`);
  return (Array.isArray(response) ? response : [])
    .map((raw) => toComplaint((raw ?? {}) as Partial<Record<keyof Complaint, unknown>>))
    .filter((complaint): complaint is Complaint => complaint !== null);
}
