/**
 * Fotos adjuntas de un reclamo en backend-go (GET/DELETE
 * /complaints/:id/attachments). Las ven el pasajero dueño y el administrador.
 * El archivo se pide con la sesión y se convierte en data URI, porque <Image>
 * no puede mandar el token en todas las plataformas (en la web no).
 */
import { apiRequest } from './client';
import { ApiError, readJson, toApiError } from './errors';
import { authFetch } from './interceptor';

export interface ComplaintPhoto {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  /** Zonas pixeladas por el backend antes de guardar (rostros, patentes). */
  maskedRegions: number;
}

const photosPath = (complaintId: string) => `/complaints/${encodeURIComponent(complaintId)}/attachments`;
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export async function fetchComplaintPhotos(complaintId: string): Promise<ComplaintPhoto[]> {
  const raw = await apiRequest<Array<Record<string, unknown>> | null>(photosPath(complaintId));
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && typeof item.id === 'string' && item.id !== '')
    .map((item) => ({
      id: item.id as string,
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : 'image/jpeg',
      width: num(item.width),
      height: num(item.height),
      maskedRegions: num(item.maskedRegions),
    }));
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}

/** Descarga la imagen y la devuelve como data URI lista para <Image>. */
export async function loadComplaintPhoto(complaintId: string, photoId: string): Promise<string> {
  const response = await authFetch(`${photosPath(complaintId)}/${encodeURIComponent(photoId)}/file`, { method: 'GET' });
  if (!response.ok) throw toApiError(response, await readJson(response));
  return blobToDataUri(await response.blob());
}

/** Borra la foto y su archivo (204 sin contenido). */
export async function deleteComplaintPhoto(complaintId: string, photoId: string): Promise<void> {
  await apiRequest(`${photosPath(complaintId)}/${encodeURIComponent(photoId)}`, { method: 'DELETE' });
}

/** 503: el servidor no tiene configurado dónde guardar las fotos. */
export const isPhotoStorageUnavailable = (error: unknown) => error instanceof ApiError && error.status === 503;
