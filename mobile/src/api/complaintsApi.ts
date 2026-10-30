/**
 * Reclamos del pasajero en backend-go: GET /api/v1/complaints/my-complaints
 * (solo rol PASSENGER) con los mismos filtros y textos que el web
 * (frontend/src/presentation/pages/passenger/PassengerComplaintsPage.tsx),
 * POST /complaints para crear uno y POST /complaints/:id/attachments para
 * adjuntarle fotos.
 */
import { apiRequest } from './client';
import { readJson, toApiError } from './errors';
import { authFetch } from './interceptor';

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

export interface RouteOption {
  id: string;
  name: string;
  code: string;
}

export interface BusOption {
  id: string;
  patente: string;
}

/** Rutas y buses para elegir en el formulario (GET /routes y GET /buses, como el web). */
export async function fetchComplaintOptions(): Promise<{ routes: RouteOption[]; buses: BusOption[] }> {
  const [routes, buses] = await Promise.all([
    apiRequest<Array<Partial<RouteOption>> | null>('/routes'),
    apiRequest<Array<Partial<BusOption>> | null>('/buses'),
  ]);
  return {
    routes: (routes ?? [])
      .filter((route) => route?.id)
      .map((route) => ({ id: String(route.id), name: String(route.name ?? ''), code: String(route.code ?? '') })),
    buses: (buses ?? [])
      .filter((bus) => bus?.id)
      .map((bus) => ({ id: String(bus.id), patente: String(bus.patente ?? '') })),
  };
}

/** Líneas que acepta backend-go en un reclamo (allowedLines en middleware/validation.go). */
export const COMPLAINT_LINES = ['7A', '7B', '1C'] as const;
export type ComplaintLine = (typeof COMPLAINT_LINES)[number];

export interface NewComplaint {
  title: string;
  description: string;
  category: ComplaintCategory;
  /**
   * Obligatorios para backend-go (ValidateComplaintPayload responde 400 sin
   * ellos), aunque el formulario del web no los envía.
   */
  lineName: ComplaintLine;
  /** Calificación del servicio, entero de 1 a 5. */
  rating: number;
  /** Al menos uno: el backend deriva de ahí la empresa responsable. */
  busId?: string;
  routeId?: string;
}

/** Crea el reclamo del pasajero con sesión iniciada (los campos vacíos no se envían). */
export async function createComplaint({ title, description, category, lineName, rating, busId, routeId }: NewComplaint): Promise<Complaint> {
  const raw = await apiRequest<Partial<Record<keyof Complaint, unknown>>>('/complaints', {
    method: 'POST',
    body: {
      title: title.trim(),
      description: description.trim(),
      category,
      lineName,
      rating,
      busId: busId || undefined,
      routeId: routeId || undefined,
    },
  });
  const complaint = toComplaint(raw ?? {});
  if (!complaint) throw new Error('El backend no devolvió el reclamo creado.');
  return complaint;
}

/** Foto lista para subir (ya convertida a JPEG, ver complaints/photos.ts). */
export interface PhotoUpload {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'image/png';
}

/** Fotos del navegador (versión web): blob: o data: URI. En el teléfono son file:// o content://. */
const isBrowserUri = (uri: string) => /^(blob|data):/i.test(uri);

async function photoFormData({ uri, name, mimeType }: PhotoUpload): Promise<FormData> {
  const form = new FormData();
  if (isBrowserUri(uri)) {
    // En el navegador se lee la foto y se envía como archivo.
    form.append('file', await (await fetch(uri)).blob(), name);
  } else {
    // React Native lee el archivo desde la URI al enviar el formulario.
    form.append('file', { uri, name, type: mimeType } as unknown as Blob);
  }
  return form;
}

/**
 * Adjunta una foto al reclamo (multipart, campo "file"). El backend acepta
 * JPEG o PNG de hasta 5 MB y como máximo 3 por reclamo, y responde 503 si no
 * tiene dónde guardarlas.
 */
export async function uploadComplaintPhoto(complaintId: string, photo: PhotoUpload): Promise<void> {
  // Sin Content-Type: fetch lo pone con el separador del formulario.
  const response = await authFetch(`/complaints/${encodeURIComponent(complaintId)}/attachments`, async () => ({
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: await photoFormData(photo),
  }));
  const data = await readJson(response);
  if (!response.ok) throw toApiError(response, data);
}
