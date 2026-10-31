import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import * as companyApi from '../../api/companyApi';
import * as photosApi from '../../api/complaintPhotosApi';
import * as complaintsApi from '../../api/complaintsApi';
import { ApiError } from '../../api/errors';
import { useAdminComplaints } from '../../hooks/useAdminComplaints';
import { AdminComplaintsScreen } from '../AdminComplaintsScreen';

jest.mock('../../api/adminApi', () => ({ fetchAllComplaints: jest.fn(), fetchComplaintStats: jest.fn(), fetchCompanies: jest.fn(), deleteComplaint: jest.fn() }));
jest.mock('../../api/complaintPhotosApi', () => ({
  ...jest.requireActual('../../api/complaintPhotosApi'),
  fetchComplaintPhotos: jest.fn(),
  loadComplaintPhoto: jest.fn(),
}));
// La confirmación se acepta sola en los tests.
jest.mock('../../utils/platform', () => ({
  ...jest.requireActual('../../utils/platform'),
  confirmAction: jest.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm()),
}));
jest.mock('../../api/companyApi', () => ({ fetchCompanyBuses: jest.fn() }));
jest.mock('../../api/complaintsApi', () => ({ ...jest.requireActual('../../api/complaintsApi'), updateComplaintStatus: jest.fn() }));

const admin = jest.mocked(adminApi);
const company = jest.mocked(companyApi);
const complaints = jest.mocked(complaintsApi);
const photos = jest.mocked(photosApi);
const base = { busId: null, routeId: null, companyId: null, adminResponse: null, rating: null, lineName: null, updatedAt: '' };

beforeEach(() => {
  jest.clearAllMocks();
  admin.fetchAllComplaints.mockResolvedValue([
    { ...base, id: 'a1b2c3d4-e5f6-7890', title: 'Micro llena', description: 'No se pudo subir', category: 'OVERCROWDING', status: 'PENDING', lineName: '7A', rating: 2, companyId: 'co1', busId: 'b1', createdAt: '2026-10-16T15:00:00Z' },
    { ...base, id: 'c2', title: 'Chofer apurado', description: 'Frenadas bruscas', category: 'DRIVER_BEHAVIOR', status: 'RESOLVED', lineName: '1C', rating: 4, adminResponse: 'Se amonestó al conductor', createdAt: '2026-10-18T15:00:00Z' },
  ]);
  admin.fetchComplaintStats.mockResolvedValue({
    total: 2, averageRating: 3, resolvedPercentage: 50, pending: 1, inReview: 0, resolved: 1, rejected: 0, byCategory: {}, byLine: {},
  });
  admin.fetchCompanies.mockResolvedValue([{ id: 'co1', name: 'Buses Ñielol', rut: '', email: '', phone: null, address: null, isActive: true }]);
  company.fetchCompanyBuses.mockResolvedValue([{ id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 0, status: 'ACTIVE', companyId: 'co1', routeId: null }]);
});

describe('useAdminComplaints', () => {
  it('si fallan las cifras, las empresas y las micros, igual muestra los reclamos', async () => {
    admin.fetchComplaintStats.mockRejectedValue(new Error('caído'));
    admin.fetchCompanies.mockRejectedValue(new Error('caído'));
    company.fetchCompanyBuses.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useAdminComplaints());

    await waitFor(() => expect(result.current.complaints).toHaveLength(2));
    expect(result.current.complaints[0]).toMatchObject({ companyName: 'co1', busPlate: 'b1' });
    expect(result.current.stats).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('si fallan los reclamos muestra el error', async () => {
    admin.fetchAllComplaints.mockRejectedValue(new ApiError(500, 'Error al obtener reclamos'));
    const { result } = await renderHook(() => useAdminComplaints());
    await waitFor(() => expect(result.current.error).toBe('Error al obtener reclamos'));
  });
});

describe('AdminComplaintsScreen', () => {
  it('muestra el encabezado, las cifras y una tarjeta por reclamo', async () => {
    await render(<AdminComplaintsScreen />);

    expect(screen.getByRole('header', { name: 'Panel de Reclamos y Calidad de Servicio' })).toBeTruthy();
    expect(await screen.findByLabelText('Total Reclamos: 2')).toBeTruthy();
    expect(screen.getByLabelText('Tasa de Resolución: 50.0%')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Listado de Reclamos (2)' })).toBeTruthy();
    expect(
      screen.getByLabelText('Reclamo a1b2c3d4, Micro llena, Sobrecupo / Aforo, pendiente, Línea 7A, 2 de 5 estrellas, Buses Ñielol, micro DEMO-01, 16 de octubre de 2026'),
    ).toBeTruthy();
    expect(screen.getByText('Se amonestó al conductor')).toBeTruthy();
  });

  it('filtra por línea, estado y categoría, y busca', async () => {
    await render(<AdminComplaintsScreen />);
    await screen.findByRole('header', { name: 'Listado de Reclamos (2)' });

    await fireEvent.press(screen.getByRole('button', { name: 'Línea: Todas las líneas' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Línea 1C' }));
    expect(screen.getByRole('header', { name: 'Listado de Reclamos (1)' })).toBeTruthy();
    expect(screen.getByText('Chofer apurado')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Pendientes' }));
    expect(screen.getByText('No se encontraron reclamos con los filtros seleccionados.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Línea: Línea 1C' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Todas las líneas' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Categoría: Todas las categorías' }));
    await fireEvent.press(screen.getByRole('radio', { name: '⚠️ Sobrecupo / Aforo' }));
    expect(screen.getByRole('header', { name: 'Listado de Reclamos (1)' })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Buscar reclamo'), 'frenadas');
    expect(screen.getByRole('header', { name: 'Listado de Reclamos (0)' })).toBeTruthy();
  });

  it('"Actualizar Datos" vuelve a cargar', async () => {
    await render(<AdminComplaintsScreen />);
    await screen.findByRole('header', { name: 'Listado de Reclamos (2)' });
    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar Datos' }));
    await waitFor(() => expect(admin.fetchAllComplaints).toHaveBeenCalledTimes(2));
  });

  it('muestra el error si no se pueden cargar', async () => {
    admin.fetchAllComplaints.mockRejectedValue(new ApiError(500, 'Error al obtener reclamos'));
    await render(<AdminComplaintsScreen />);
    expect(await screen.findByText('Error al obtener reclamos')).toBeTruthy();
  });
});

describe('AdminComplaintsScreen: gestión', () => {
  const open = async () => {
    await render(<AdminComplaintsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Gestionar reclamo a1b2c3d4' }));
  };

  it('los reclamos cerrados no se pueden gestionar', async () => {
    await render(<AdminComplaintsScreen />);
    await screen.findByRole('header', { name: 'Listado de Reclamos (2)' });
    expect(screen.queryByRole('button', { name: 'Gestionar reclamo c2' })).toBeNull();
    expect(screen.getByText('Reclamo cerrado')).toBeTruthy();
  });

  it('muestra el contexto del incidente y parte en "En Revisión"', async () => {
    await open();

    expect(screen.getByText('Resolución Oficial de Reclamo')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Micro llena' })).toBeTruthy();
    expect(screen.getByLabelText('Línea / Micro: 7A (DEMO-01)')).toBeTruthy();
    expect(screen.getByLabelText('Categoría: Sobrecupo / Aforo')).toBeTruthy();
    expect(screen.getByLabelText('Calificación Pasajero: 2 de 5')).toBeTruthy();
    expect(screen.getByLabelText('Empresa: Buses Ñielol')).toBeTruthy();
    expect(screen.getAllByText('No se pudo subir').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: '🔍 En Revisión' })).toBeChecked();
  });

  it('pasar a revisión guarda sin confirmar y recarga la lista', async () => {
    complaints.updateComplaintStatus.mockResolvedValue({} as complaintsApi.Complaint);
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Resolución' }));
    expect(screen.getByText('Escribe una respuesta para el pasajero.')).toBeTruthy();
    expect(complaints.updateComplaintStatus).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Respuesta Oficial de la Administración'), 'Revisaremos el aforo de la línea');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Resolución' }));

    expect(await screen.findByText('Reclamo a1b2c3d4 actualizado a en revisión')).toBeTruthy();
    expect(complaints.updateComplaintStatus).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890', { status: 'IN_REVIEW', adminResponse: 'Revisaremos el aforo de la línea' });
    expect(admin.fetchAllComplaints).toHaveBeenCalledTimes(2);
    expect(admin.fetchComplaintStats).toHaveBeenCalledTimes(2);
  });

  it('resolver pide confirmación; "Volver" regresa al formulario sin guardar', async () => {
    complaints.updateComplaintStatus.mockResolvedValue({} as complaintsApi.Complaint);
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: '✅ Resolver' }));
    await fireEvent.changeText(screen.getByLabelText('Respuesta Oficial de la Administración'), 'Reforzamos la frecuencia');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Resolución' }));

    expect(screen.getByRole('header', { name: 'Resolver reclamo' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByDisplayValue('Reforzamos la frecuencia')).toBeTruthy();
    expect(complaints.updateComplaintStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Resolución' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Reclamo a1b2c3d4 actualizado a resuelto')).toBeTruthy();
    expect(complaints.updateComplaintStatus).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890', { status: 'RESOLVED', adminResponse: 'Reforzamos la frecuencia' });
  });

  it('si el backend rechaza el cambio, vuelve al formulario con el error y la respuesta escrita', async () => {
    complaints.updateComplaintStatus.mockRejectedValue(new ApiError(400, 'Transición de estado no permitida'));
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: '❌ Rechazar' }));
    await fireEvent.changeText(screen.getByLabelText('Respuesta Oficial de la Administración'), 'No corresponde');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Resolución' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Transición de estado no permitida')).toBeTruthy();
    expect(screen.getByDisplayValue('No corresponde')).toBeTruthy();
  });

  it('"Cancelar" cierra sin guardar', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Resolución Oficial de Reclamo')).toBeNull();
    expect(complaints.updateComplaintStatus).not.toHaveBeenCalled();
  });
});

describe('AdminComplaintsScreen: fotos y eliminar', () => {
  it('muestra las fotos del reclamo y las abre en grande', async () => {
    photos.fetchComplaintPhotos.mockResolvedValue([
      { id: 'p1', mimeType: 'image/jpeg', width: 800, height: 600, maskedRegions: 2 },
      { id: 'p2', mimeType: 'image/jpeg', width: 800, height: 600, maskedRegions: 0 },
    ]);
    photos.loadComplaintPhoto.mockImplementation(async (_c, id) => {
      if (id === 'p2') throw new ApiError(404, 'Imagen no encontrada');
      return 'data:image/jpeg;base64,QUJD';
    });
    await render(<AdminComplaintsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver fotos del reclamo a1b2c3d4' }));

    expect(await screen.findByRole('button', { name: 'Ver foto 1 de 2' })).toBeTruthy();
    expect(photos.fetchComplaintPhotos).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890');
    // Si una foto no se puede descargar, las demás se ven igual.
    expect(screen.getByLabelText('La foto 2 no se pudo cargar')).toBeTruthy();
    expect(screen.getByText('🔒 2 zonas pixeladas (rostros o patentes) para proteger la privacidad.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Ver foto 1 de 2' }));
    expect(screen.getByRole('button', { name: 'Cerrar foto' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar fotos del reclamo a1b2c3d4' }));
    expect(screen.queryByText('Fotos adjuntas')).toBeNull();
  });

  it('sin fotos lo dice, y avisa si el servidor no guarda fotos', async () => {
    photos.fetchComplaintPhotos.mockResolvedValueOnce([]);
    await render(<AdminComplaintsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Ver fotos del reclamo a1b2c3d4' }));
    expect(await screen.findByText('Este reclamo no tiene fotos.')).toBeTruthy();

    photos.fetchComplaintPhotos.mockRejectedValueOnce(new ApiError(503, 'no disponible'));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver fotos del reclamo c2' }));
    expect(await screen.findByText('El servidor no tiene habilitado el almacenamiento de fotos.')).toBeTruthy();
  });

  it('elimina un reclamo tras confirmar y recarga', async () => {
    admin.deleteComplaint.mockResolvedValue(undefined);
    await render(<AdminComplaintsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Eliminar reclamo c2' }));

    const { confirmAction } = jest.requireMock('../../utils/platform');
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Eliminar reclamo',
        message: '¿Eliminar el reclamo c2 – Chofer apurado? Se borran también sus fotos. Esta acción no se puede deshacer.',
        destructive: true,
      }),
    );
    expect(await screen.findByText('Reclamo c2 eliminado')).toBeTruthy();
    expect(admin.deleteComplaint).toHaveBeenCalledWith('c2');
    expect(admin.fetchAllComplaints).toHaveBeenCalledTimes(2);
  });

  it('si no se puede eliminar, lo avisa sin mostrar el error interno', async () => {
    admin.deleteComplaint.mockRejectedValue(new ApiError(500, 'Error al eliminar reclamo: ERROR interno'));
    await render(<AdminComplaintsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Eliminar reclamo c2' }));
    expect(await screen.findByText('No se pudo eliminar el reclamo.')).toBeTruthy();
  });
});
