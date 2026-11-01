import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as complaintsApi from '../../api/complaintsApi';
import type { Complaint } from '../../api/complaintsApi';
import { ApiError } from '../../api/errors';
import * as photosModule from '../../complaints/photos';
import type { ComplaintPhoto } from '../../complaints/photos';
import { ComplaintForm, photoWarningFor, validateComplaint, EMPTY_FORM } from '../ComplaintForm';

jest.mock('../../api/complaintsApi', () => ({
  ...jest.requireActual('../../api/complaintsApi'),
  createComplaint: jest.fn(),
  fetchComplaintOptions: jest.fn(),
  uploadComplaintPhoto: jest.fn(),
}));
jest.mock('../../complaints/photos', () => ({
  ...jest.requireActual('../../complaints/photos'),
  pickPhotos: jest.fn(),
  takePhoto: jest.fn(),
}));

const api = jest.mocked(complaintsApi);
const photos = jest.mocked(photosModule);

const created: Complaint = {
  id: 'nuevo',
  title: 'Micro atrasada',
  description: 'Pasó 20 minutos tarde',
  category: 'DELAY',
  status: 'PENDING',
  busId: 'b1',
  routeId: null,
  companyId: 'co1',
  adminResponse: null,
  createdAt: '2026-10-30T12:00:00Z',
  updatedAt: '2026-10-30T12:00:00Z',
};
const photo = (n: number): ComplaintPhoto => ({ uri: `file:///foto-${n}.jpg`, name: `foto-${n}.jpg`, mimeType: 'image/jpeg', width: 2000, height: 1500 });

beforeEach(() => {
  jest.clearAllMocks();
  api.fetchComplaintOptions.mockResolvedValue({
    routes: [{ id: 'r1', name: 'Centro', code: '7A' }],
    buses: [{ id: 'b1', patente: 'ABCD12' }],
  });
  api.createComplaint.mockResolvedValue(created);
  api.uploadComplaintPhoto.mockResolvedValue();
});

async function renderForm(onCreated = jest.fn(), onClose = jest.fn()) {
  await render(<ComplaintForm visible onClose={onClose} onCreated={onCreated} />);
  await waitFor(() => expect(api.fetchComplaintOptions).toHaveBeenCalled());
  return { onCreated, onClose };
}

async function fillValidForm() {
  await fireEvent.changeText(screen.getByLabelText('Título:'), 'Micro atrasada');
  await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Pasó 20 minutos tarde');
  await fireEvent.press(screen.getByRole('button', { name: 'Categoría:: Seleccionar categoría' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Retraso' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Línea:: Seleccionar línea' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Línea 7B' }));
  await fireEvent.press(screen.getByRole('radio', { name: '2 de 5: Malo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Bus (opcional):: Sin especificar' }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'ABCD12' }));
}

describe('validateComplaint', () => {
  it('pide los campos obligatorios y un bus o una ruta, con los mensajes del web', () => {
    expect(validateComplaint(EMPTY_FORM)).toBe('Complete todos los campos obligatorios');
    const filled = { ...EMPTY_FORM, title: 'T', description: 'D', category: 'DELAY' as const, lineName: '7A' as const, rating: 4 };
    expect(validateComplaint(filled)).toBe('Selecciona un bus o una ruta para identificar la empresa responsable');
    expect(validateComplaint({ ...filled, routeId: 'r1' })).toBeNull();
    expect(validateComplaint({ ...filled, title: '   ', busId: 'b1' })).toBe('Complete todos los campos obligatorios');
    // Línea y calificación también son obligatorias (las exige backend-go).
    expect(validateComplaint({ ...filled, lineName: '', busId: 'b1' })).toBe('Complete todos los campos obligatorios');
    expect(validateComplaint({ ...filled, rating: 0, busId: 'b1' })).toBe('Complete todos los campos obligatorios');
  });

  it('el aviso de fotos dice cuántas fallaron', () => {
    expect(photoWarningFor(1, 1, 'sin espacio')).toBe('El reclamo se creó, pero no se pudo subir la foto: sin espacio');
    expect(photoWarningFor(2, 2, 'x')).toMatch(/no se pudo subir las fotos: x$/);
    expect(photoWarningFor(1, 3, 'x')).toMatch(/no se pudo subir 1 de 3 fotos: x$/);
  });
});

describe('ComplaintForm', () => {
  it('muestra los campos del web con las rutas y buses del backend', async () => {
    await renderForm();

    expect(screen.getByRole('header', { name: 'Nuevo reclamo' })).toBeTruthy();
    expect(screen.getByText('Selecciona al menos un bus o una ruta: así identificamos a la empresa responsable del reclamo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ruta (opcional):: Sin especificar' }));
    expect(await screen.findByRole('radio', { name: '7A - Centro' })).toBeTruthy();
  });

  it('no envía si falta algo y muestra por qué', async () => {
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar reclamo' }));

    expect(screen.getByText('Complete todos los campos obligatorios')).toBeTruthy();
    expect(api.createComplaint).not.toHaveBeenCalled();
  });

  it('crea el reclamo, sube las fotos y avisa', async () => {
    photos.pickPhotos.mockResolvedValue([photo(1), photo(2)]);
    const { onCreated } = await renderForm();
    await fillValidForm();
    await fireEvent.press(screen.getByRole('button', { name: '🖼️ Elegir de la galería' }));
    expect(await screen.findByLabelText('Foto 2')).toBeTruthy();
    expect(photos.pickPhotos).toHaveBeenCalledWith(3);

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar reclamo' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ complaint: created, photoWarning: null }));
    expect(api.createComplaint).toHaveBeenCalledWith({
      title: 'Micro atrasada',
      description: 'Pasó 20 minutos tarde',
      category: 'DELAY',
      lineName: '7B',
      rating: 2,
      busId: 'b1',
      routeId: '',
    });
    expect(api.uploadComplaintPhoto.mock.calls).toEqual([
      ['nuevo', photo(1)],
      ['nuevo', photo(2)],
    ]);
  });

  it('si una foto falla, el reclamo igual queda creado y se avisa', async () => {
    photos.takePhoto.mockResolvedValue(photo(1));
    api.uploadComplaintPhoto.mockRejectedValue(new ApiError(503, 'el almacenamiento de imágenes no está disponible'));
    const { onCreated } = await renderForm();
    await fillValidForm();
    await fireEvent.press(screen.getByRole('button', { name: '📷 Tomar foto' }));
    await screen.findByLabelText('Foto 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar reclamo' }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        complaint: created,
        photoWarning: 'El reclamo se creó, pero no se pudo subir la foto: el almacenamiento de imágenes no está disponible',
      }),
    );
  });

  it('si el backend rechaza el reclamo muestra su mensaje y no sube fotos', async () => {
    api.createComplaint.mockRejectedValue(new ApiError(500, 'Error al crear reclamo'));
    const { onCreated } = await renderForm();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar reclamo' }));

    expect(await screen.findByText('Error al crear reclamo')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(api.uploadComplaintPhoto).not.toHaveBeenCalled();
  });

  it('se puede quitar una foto, y con 3 ya no deja agregar más', async () => {
    photos.pickPhotos.mockResolvedValue([photo(1), photo(2), photo(3)]);
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: '🖼️ Elegir de la galería' }));
    await screen.findByLabelText('Foto 3');
    expect(screen.getByText('Ya agregaste el máximo de 3 fotos.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '📷 Tomar foto' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Quitar foto 2' }));
    expect(screen.queryByLabelText('Foto 3')).toBeNull();
    expect(screen.getByRole('button', { name: '📷 Tomar foto' })).toBeEnabled();
  });

  it('sin permiso para la cámara explica cómo darlo', async () => {
    photos.takePhoto.mockRejectedValue(new photosModule.PhotoPermissionError('camera'));
    await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: '📷 Tomar foto' }));

    expect(await screen.findByText(/permiso para usar la cámara/)).toBeTruthy();
  });

  it('Cancelar cierra y deja el formulario vacío', async () => {
    const { onClose } = await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Título:'), 'Borrador');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByLabelText('Título:').props.value).toBe('');
  });
});
