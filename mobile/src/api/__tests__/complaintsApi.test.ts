import * as SecureStore from 'expo-secure-store';

import { saveTokens } from '../../storage/tokenStorage';
import { authHeaderOf, bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  createComplaint,
  fetchComplaintOptions,
  fetchMyComplaints,
  STATUS_OPTIONS,
  statusLabel,
  uploadComplaintPhoto,
} from '../complaintsApi';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const complaint = {
  id: 'c1',
  title: 'Micro atrasada',
  description: 'Pasó 20 minutos tarde',
  category: 'DELAY',
  status: 'IN_REVIEW',
  rating: null,
  lineName: null,
  adminResponse: 'Estamos revisando',
  passengerId: 'u1',
  busId: 'b1',
  routeId: null,
  companyId: 'co1',
  tripId: null,
  createdAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T13:00:00Z',
};

describe('fetchMyComplaints', () => {
  it('pide los reclamos del pasajero con su token y sin filtros', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    await fetchMyComplaints();

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/complaints\/my-complaints$/);
    expect(new URL(url).search).toBe('');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('envía los filtros de categoría y estado como el web', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [] }));
    await fetchMyComplaints({ category: 'OVERCROWDING', status: 'RESOLVED' });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('category')).toBe('OVERCROWDING');
    expect(url.searchParams.get('status')).toBe('RESOLVED');
  });

  it('normaliza cada reclamo y descarta los que no traen id', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: [complaint, { title: 'sin id' }, null] }));

    expect(await fetchMyComplaints()).toEqual([
      {
        id: 'c1',
        title: 'Micro atrasada',
        description: 'Pasó 20 minutos tarde',
        category: 'DELAY',
        status: 'IN_REVIEW',
        busId: 'b1',
        routeId: null,
        companyId: 'co1',
        adminResponse: 'Estamos revisando',
        createdAt: '2026-10-29T12:00:00Z',
        updatedAt: '2026-10-29T13:00:00Z',
      },
    ]);
  });

  it('sin reclamos el backend puede responder null: lista vacía', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: null }));
    expect(await fetchMyComplaints()).toEqual([]);
  });

  it('un error del backend llega como ApiError', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 500, body: { error: 'Error al obtener reclamos' } }));
    await expect(fetchMyComplaints()).rejects.toMatchObject({ name: 'ApiError', status: 500 });
  });
});

describe('textos de reclamos', () => {
  it('categorías y estados con los nombres del web', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.label)).toEqual([
      'Retraso',
      'Exceso de pasajeros',
      'Comportamiento del conductor',
      'Estado del vehículo',
      'Accesibilidad',
      'Otro',
    ]);
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual(['Pendiente', 'En revisión', 'Resuelto', 'Rechazado']);
    expect(categoryLabel('VEHICLE_CONDITION')).toBe('Condición del vehículo');
    expect(statusLabel('IN_REVIEW')).toBe('En revisión');
  });

  it('una categoría o estado desconocido se muestra tal cual', () => {
    expect(categoryLabel('NUEVA')).toBe('NUEVA');
    expect(statusLabel('ARCHIVED')).toBe('ARCHIVED');
  });
});

describe('createComplaint', () => {
  it('envía el reclamo como el web: textos sin espacios de más y sin bus/ruta vacíos', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 201, body: { ...complaint, id: 'nuevo', status: 'PENDING' } }));
    const created = await createComplaint({
      title: '  Micro atrasada ',
      description: ' Pasó tarde ',
      category: 'DELAY',
      lineName: '7A',
      rating: 2,
      busId: '',
      routeId: 'r1',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/complaints$/);
    expect(init?.method).toBe('POST');
    // Línea y calificación van siempre: backend-go las exige.
    expect(bodyOf(fetchMock, 0)).toEqual({ title: 'Micro atrasada', description: 'Pasó tarde', category: 'DELAY', lineName: '7A', rating: 2, routeId: 'r1' });
    expect(created).toMatchObject({ id: 'nuevo', status: 'PENDING' });
  });

  it('un rechazo del backend llega con su mensaje', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 400, body: { error: 'Cuerpo de la solicitud inválido' } }));
    await expect(createComplaint({ title: 't', description: 'd', category: 'OTHER', lineName: '1C', rating: 5, busId: 'b1' })).rejects.toMatchObject({
      status: 400,
      message: 'Cuerpo de la solicitud inválido',
    });
  });
});

describe('fetchComplaintOptions', () => {
  it('trae rutas y buses para el formulario', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      fakeResponse({
        body: url.includes('/routes')
          ? [{ id: 'r1', name: 'Centro', code: '7A', companyId: 'co1' }, { name: 'sin id' }]
          : [{ id: 'b1', patente: 'ABCD12', companyId: 'co1', routeId: 'r1' }],
      }),
    );

    expect(await fetchComplaintOptions()).toEqual({
      routes: [{ id: 'r1', name: 'Centro', code: '7A' }],
      buses: [{ id: 'b1', patente: 'ABCD12' }],
    });
  });
});

describe('uploadComplaintPhoto', () => {
  const photo = { uri: 'file:///cache/foto.jpg', name: 'foto-reclamo-1.jpg', mimeType: 'image/jpeg' as const };

  it('sube la foto como formulario multipart en el campo "file", con el token', async () => {
    // FormData falso que anota lo agregado (en Jest no está el de React Native).
    class RecordingFormData {
      parts: unknown[][] = [];
      append(...args: unknown[]) {
        this.parts.push(args);
      }
    }
    const realFormData = globalThis.FormData;
    globalThis.FormData = RecordingFormData as unknown as typeof FormData;
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 201, body: { id: 'a1' } }));
    try {
      await uploadComplaintPhoto('c 1', photo);
    } finally {
      globalThis.FormData = realFormData;
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/complaints\/c%201\/attachments$/);
    expect(init?.method).toBe('POST');
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-1');
    // Sin Content-Type propio: fetch pone el del formulario con su separador.
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init?.body).toBeInstanceOf(RecordingFormData);
    expect((init?.body as unknown as RecordingFormData).parts).toEqual([['file', { uri: photo.uri, name: photo.name, type: 'image/jpeg' }]]);
  });

  it('si el backend la rechaza llega su mensaje (ej. límite de fotos)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 409, body: { error: 'el reclamo ya tiene el máximo de 3 imágenes' } }));
    await expect(uploadComplaintPhoto('c1', photo)).rejects.toMatchObject({ status: 409, message: 'el reclamo ya tiene el máximo de 3 imágenes' });
  });
});
