/**
 * Fotos de un reclamo: elegirlas de la galería o sacarlas con la cámara y
 * dejarlas listas para backend-go (JPEG o PNG, hasta 5 MB, máximo 3).
 *
 * Cada foto se vuelve a guardar como JPEG con el lado mayor en
 * MAX_PHOTO_SIDE px: así una foto HEIC del iPhone o una muy grande igual se
 * acepta, pesa poco al subirla y no lleva los datos EXIF (como la ubicación
 * GPS donde se sacó).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PhotoUpload } from '../api/complaintsApi';

/** Máximo de fotos por reclamo (MaxAttachmentsPerComplaint en backend-go). */
export const MAX_PHOTOS = 3;

/** Lado mayor de la foto guardada (px): de sobra para ver un detalle y muy por debajo del límite del backend. */
export const MAX_PHOTO_SIDE = 2000;

/** Calidad del JPEG guardado (0 a 1). */
export const PHOTO_QUALITY = 0.8;

export interface ComplaintPhoto extends PhotoUpload {
  width: number;
  height: number;
}

export class PhotoPermissionError extends Error {
  constructor(source: 'camera' | 'library') {
    super(
      source === 'camera'
        ? 'Necesitamos permiso para usar la cámara. Puedes darlo en los ajustes del teléfono.'
        : 'Necesitamos permiso para ver tus fotos. Puedes darlo en los ajustes del teléfono.',
    );
    this.name = 'PhotoPermissionError';
  }
}

/** Tamaño final manteniendo la proporción, o null si ya cabe. */
export function fitWithin(width: number, height: number, max: number = MAX_PHOTO_SIDE): { width: number; height: number } | null {
  if (width <= max && height <= max) return null;
  return width >= height
    ? { width: max, height: Math.round((height * max) / width) }
    : { width: Math.round((width * max) / height), height: max };
}

let photoCounter = 0;

/** Convierte lo que entrega el selector en una foto JPEG lista para subir. */
export async function preparePhoto(asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>): Promise<ComplaintPhoto> {
  const context = ImageManipulator.manipulate(asset.uri);
  const size = fitWithin(asset.width, asset.height);
  if (size) context.resize(size);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  photoCounter += 1;
  return { uri: saved.uri, width: saved.width, height: saved.height, name: `foto-reclamo-${photoCounter}.jpg`, mimeType: 'image/jpeg' };
}

/** Elige hasta `remaining` fotos de la galería ([] si el usuario cancela). */
export async function pickPhotos(remaining: number): Promise<ComplaintPhoto[]> {
  if (remaining <= 0) return [];
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError('library');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: remaining > 1,
    selectionLimit: remaining,
    quality: 1,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, remaining).map(preparePhoto));
}

/** Saca una foto con la cámara (null si el usuario cancela). */
export async function takePhoto(): Promise<ComplaintPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError('camera');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || result.assets.length === 0) return null;
  return preparePhoto(result.assets[0]);
}
