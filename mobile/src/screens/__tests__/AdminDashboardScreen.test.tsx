import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import type { ComplaintStats } from '../../api/adminApi';
import { ApiError } from '../../api/errors';
import { useAdminDashboard } from '../../hooks/useAdminDashboard';
import { AdminDashboardScreen } from '../AdminDashboardScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../api/adminApi', () => ({ fetchComplaintStats: jest.fn() }));

const fetchComplaintStats = jest.mocked(adminApi.fetchComplaintStats);
const stats: ComplaintStats = {
  total: 12,
  averageRating: 3.4,
  resolvedPercentage: 41.67,
  pending: 4,
  inReview: 2,
  resolved: 5,
  rejected: 1,
  byCategory: { OVERCROWDING: 7, DELAY: 5 },
  byLine: { '7A': 8, '1C': 4 },
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchComplaintStats.mockResolvedValue(stats);
});

describe('useAdminDashboard', () => {
  it('carga las estadísticas, y si una recarga falla conserva los datos anteriores', async () => {
    const { result } = await renderHook(() => useAdminDashboard());
    await waitFor(() => expect(result.current.stats).toEqual(stats));
    expect(fetchComplaintStats).toHaveBeenCalledWith();

    fetchComplaintStats.mockRejectedValueOnce(new ApiError(500, 'Error al calcular estadísticas de reclamos'));
    await act(() => result.current.refresh());

    expect(result.current.error).toBe('Error al calcular estadísticas de reclamos');
    expect(result.current.stats).toEqual(stats);
  });
});

describe('AdminDashboardScreen', () => {
  it('muestra el encabezado y las 4 cifras del panel del web', async () => {
    await render(<AdminDashboardScreen />);

    expect(screen.getByRole('header', { name: 'Panel de Reclamos y Calidad de Servicio' })).toBeTruthy();
    expect(await screen.findByLabelText('Total Reclamos: 12')).toBeTruthy();
    expect(screen.getByLabelText('CSAT Promedio Flota: 3.4 de 5')).toBeTruthy();
    expect(screen.getByLabelText('Tasa de Resolución: 41.7%')).toBeTruthy();
    expect(screen.getByLabelText('Reclamos Pendientes: 4')).toBeTruthy();
  });

  it('muestra los reclamos por estado, por categoría y por línea', async () => {
    await render(<AdminDashboardScreen />);

    expect(await screen.findByLabelText('En revisión: 2')).toBeTruthy();
    expect(screen.getByLabelText('Rechazados: 1')).toBeTruthy();
    expect(screen.getByLabelText('⚠️ Sobrecupo / Aforo: 7 (58%)')).toBeTruthy();
    expect(screen.getByLabelText('⏱️ Frecuencia / Retraso: 5 (42%)')).toBeTruthy();
    expect(screen.getByLabelText('Línea 7A: 8 (67%)')).toBeTruthy();
  });

  it('mientras carga o si falla, las cifras muestran "—" y el error', async () => {
    fetchComplaintStats.mockRejectedValue(new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión a internet.'));
    await render(<AdminDashboardScreen />);

    expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión a internet.')).toBeTruthy();
    expect(screen.getByLabelText('Total Reclamos: —')).toBeTruthy();
    expect(screen.queryByText('Reclamos por categoría')).toBeNull();
  });

  it('"Actualizar Datos" vuelve a pedir y el acceso lleva a la gestión de reclamos', async () => {
    await render(<AdminDashboardScreen />);
    await screen.findByLabelText('Total Reclamos: 12');

    await fireEvent.press(screen.getByRole('button', { name: 'Actualizar Datos' }));
    await waitFor(() => expect(fetchComplaintStats).toHaveBeenCalledTimes(2));

    await fireEvent.press(screen.getByRole('button', { name: 'Gestionar reclamos' }));
    expect(mockPush).toHaveBeenCalledWith('/admin/complaints');
  });
});
