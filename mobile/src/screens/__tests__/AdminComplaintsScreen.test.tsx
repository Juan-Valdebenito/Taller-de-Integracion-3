import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import * as companyApi from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useAdminComplaints } from '../../hooks/useAdminComplaints';
import { AdminComplaintsScreen } from '../AdminComplaintsScreen';

jest.mock('../../api/adminApi', () => ({ fetchAllComplaints: jest.fn(), fetchComplaintStats: jest.fn(), fetchCompanies: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ fetchCompanyBuses: jest.fn() }));

const admin = jest.mocked(adminApi);
const company = jest.mocked(companyApi);
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
