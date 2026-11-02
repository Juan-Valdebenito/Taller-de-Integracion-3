import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { fitWithin, MAX_PHOTO_SIDE, PHOTO_QUALITY, pickPhotos, preparePhoto, takePhoto } from '../photos';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const resize = jest.fn();
const saveAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: { manipulate: jest.fn() },
}));

const picker = jest.mocked(ImagePicker);
const manipulate = jest.mocked(ImageManipulator.manipulate);
const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' } as never;
const denied = { granted: false, status: 'denied', canAskAgain: false, expires: 'never' } as never;
const asset = (uri: string, width = 4032, height = 3024) => ({ uri, width, height }) as ImagePicker.ImagePickerAsset;

beforeEach(() => {
  jest.clearAllMocks();
  const context = { resize, renderAsync: jest.fn(async () => ({ saveAsync })) };
  resize.mockReturnValue(context);
  manipulate.mockReturnValue(context as never);
  saveAsync.mockImplementation(async () => ({ uri: `file:///cache/out-${saveAsync.mock.calls.length}.jpg`, width: 2000, height: 1500 }));
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue(granted);
  picker.requestCameraPermissionsAsync.mockResolvedValue(granted);
});

describe('fotos de reclamos', () => {
  it('ajusta el lado mayor a 2000 px manteniendo la proporción', () => {
    expect(MAX_PHOTO_SIDE).toBe(2000);
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1200, 900)).toBeNull();
  });

  it('cada foto se guarda como JPEG achicado (sirve aunque venga en HEIC)', async () => {
    const photo = await preparePhoto(asset('file:///IMG.HEIC'));

    expect(manipulate).toHaveBeenCalledWith('file:///IMG.HEIC');
    expect(resize).toHaveBeenCalledWith({ width: 2000, height: 1500 });
    expect(saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    expect(photo).toMatchObject({ uri: 'file:///cache/out-1.jpg', mimeType: 'image/jpeg', width: 2000, height: 1500 });
    expect(photo.name).toMatch(/^foto-reclamo-\d+\.jpg$/);
  });

  it('una foto chica no se agranda', async () => {
    await preparePhoto(asset('file:///chica.png', 800, 600));
    expect(resize).not.toHaveBeenCalled();
    expect(saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  });

  it('desde la galería pide solo las fotos que faltan para llegar a 3', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset('a'), asset('b'), asset('c')] } as never);

    const photos = await pickPhotos(2);

    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 2 }),
    );
    expect(photos).toHaveLength(2);
  });

  it('con 3 fotos ya no abre la galería, y si se cancela no agrega nada', async () => {
    expect(await pickPhotos(0)).toEqual([]);
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();

    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await pickPhotos(3)).toEqual([]);
  });

  it('con la cámara saca una foto y la prepara', async () => {
    picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset('file:///camara.jpg')] } as never);
    expect(await takePhoto()).toMatchObject({ mimeType: 'image/jpeg' });

    picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await takePhoto()).toBeNull();
  });

  it('sin permiso explica cómo darlo', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue(denied);
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue(denied);

    await expect(takePhoto()).rejects.toMatchObject({ name: 'PhotoPermissionError', message: expect.stringMatching(/cámara/) });
    await expect(pickPhotos(3)).rejects.toMatchObject({ name: 'PhotoPermissionError', message: expect.stringMatching(/fotos/) });
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });
});
