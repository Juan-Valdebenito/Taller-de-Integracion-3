import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { deleteComplaint } from '../adminApi';
import { deleteComplaintPhoto, fetchComplaintPhotos, isPhotoStorageUnavailable, loadComplaintPhoto } from '../complaintPhotosApi';
import { ApiError } from '../errors';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const pathOf = (call: number) => new URL(fetchMock.mock.calls[call]![0]).pathname;
const methodOf = (call: number) => fetchMock.mock.calls[call]![1]?.method ?? 'GET';
const photo = { id: 'p1', complaintId: 'c 1', mimeType: 'image/jpeg', sizeBytes: 1200, width: 800, height: 600, sha256: 'x', maskedRegions: 2 };

describe('fetchComplaintPhotos', () => {
  it('lista las fotos con la sesión y descarta las que no traen id', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [photo, { mimeType: 'image/png' }, null] }));

    expect(await fetchComplaintPhotos('c 1')).toEqual([{ id: 'p1', mimeType: 'image/jpeg', width: 800, height: 600, maskedRegions: 2 }]);
    expect(pathOf(0)).toMatch(/\/complaints\/c%201\/attachments$/);
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
  });

  it('reconoce el 503 de almacenamiento no disponible', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 503, body: { error: 'Almacenamiento no disponible' } }));
    const error = await fetchComplaintPhotos('c1').catch((e: unknown) => e);
    expect(isPhotoStorageUnavailable(error)).toBe(true);
    expect(isPhotoStorageUnavailable(new ApiError(500, 'x'))).toBe(false);
  });
});

describe('loadComplaintPhoto', () => {
  const realFileReader = globalThis.FileReader;
  afterEach(() => {
    globalThis.FileReader = realFileReader;
  });

  it('descarga el archivo con la sesión y lo devuelve como data URI', async () => {
    class FakeReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: { text: string }) {
        this.result = `data:image/jpeg;base64,${blob.text}`;
        this.onload?.();
      }
    }
    globalThis.FileReader = FakeReader as unknown as typeof FileReader;
    fetchMock.mockResolvedValueOnce({ ...fakeResponse(), blob: async () => ({ text: 'QUJD' }) } as unknown as Response);

    expect(await loadComplaintPhoto('c1', 'p1')).toBe('data:image/jpeg;base64,QUJD');
    expect(pathOf(0)).toMatch(/\/complaints\/c1\/attachments\/p1\/file$/);
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
  });

  it('un error del backend llega como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 404, body: { error: 'Imagen no encontrada' } }));
    await expect(loadComplaintPhoto('c1', 'p9')).rejects.toMatchObject({ name: 'ApiError', status: 404, message: 'Imagen no encontrada' });
  });
});

describe('deleteComplaint', () => {
  it('borra primero cada foto (para que no queden archivos) y después el reclamo', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ body: [photo, { ...photo, id: 'p2' }] }))
      .mockResolvedValueOnce(fakeResponse({ status: 204 }))
      .mockResolvedValueOnce(fakeResponse({ status: 204 }))
      .mockResolvedValueOnce(fakeResponse({ body: { message: 'Reclamo eliminado correctamente' } }));

    await deleteComplaint('c1');
    expect(fetchMock.mock.calls.map((_, i) => `${methodOf(i)} ${pathOf(i).replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'GET /complaints/c1/attachments',
      'DELETE /complaints/c1/attachments/p1',
      'DELETE /complaints/c1/attachments/p2',
      'DELETE /complaints/c1',
    ]);
  });

  it('si una foto no se puede borrar, no elimina el reclamo', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ body: [photo] }))
      .mockResolvedValueOnce(fakeResponse({ status: 500, body: { error: 'Error al borrar la imagen' } }));

    await expect(deleteComplaint('c1')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin almacenamiento de fotos (503) elimina el reclamo igual', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ status: 503, body: { error: 'Almacenamiento no disponible' } }))
      .mockResolvedValueOnce(fakeResponse({ body: { message: 'Reclamo eliminado correctamente' } }));

    await deleteComplaint('c1');
    expect(`${methodOf(1)} ${pathOf(1)}`).toMatch(/^DELETE .*\/complaints\/c1$/);
  });

  it('deleteComplaintPhoto acepta el 204 sin contenido', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 204 }));
    await expect(deleteComplaintPhoto('c1', 'p1')).resolves.toBeUndefined();
  });
});
