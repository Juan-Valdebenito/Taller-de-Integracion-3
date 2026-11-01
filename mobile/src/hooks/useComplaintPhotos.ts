import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchComplaintPhotos, isPhotoStorageUnavailable, loadComplaintPhoto, type ComplaintPhoto } from '../api/complaintPhotosApi';
import { ApiError } from '../api/errors';

export interface LoadedPhoto extends ComplaintPhoto {
  /** data URI de la imagen; null si no se pudo descargar. */
  uri: string | null;
}

export interface UseComplaintPhotosResult {
  photos: LoadedPhoto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Fotos de un reclamo, descargadas con la sesión. Si una falla, las demás se muestran igual. */
export function useComplaintPhotos(complaintId: string): UseComplaintPhotosResult {
  const [photos, setPhotos] = useState<LoadedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchComplaintPhotos(complaintId);
      const loaded = await Promise.all(list.map(async (photo) => ({ ...photo, uri: await loadComplaintPhoto(complaintId, photo.id).catch(() => null) })));
      if (id === requestId.current) setPhotos(loaded);
    } catch (e) {
      if (id !== requestId.current) return;
      setPhotos([]);
      setError(
        isPhotoStorageUnavailable(e)
          ? 'El servidor no tiene habilitado el almacenamiento de fotos.'
          : e instanceof ApiError
            ? e.message
            : 'No se pudieron cargar las fotos.',
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { photos, loading, error, reload };
}
