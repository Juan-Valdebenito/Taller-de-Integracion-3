import { fireEvent, render, screen } from '@testing-library/react-native';

import * as complaintsApi from '../../api/complaintsApi';
import type { Complaint } from '../../api/complaintsApi';
import { useAuth } from '../../auth/AuthContext';
import { useCompanyComplaints } from '../../hooks/useCompanyComplaints';
import { mockAuthValue } from '../../test-utils/auth';
import { CompanyComplaintsScreen } from '../CompanyComplaintsScreen';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../hooks/useCompanyComplaints', () => ({ useCompanyComplaints: jest.fn() }));
jest.mock('../../api/complaintsApi', () => ({
  ...jest.requireActual('../../api/complaintsApi'),
  updateComplaintStatus: jest.fn(),
}));

const complaint: Complaint = {
  id: 'c1', title: 'Micro atrasada', description: 'Esperé 20 minutos', category: 'DELAY', status: 'PENDING',
  busId: 'b1', routeId: 'r1', companyId: 'co1', adminResponse: null, createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ status: 'signedIn', user: { id: 'u1', name: 'Empresa', email: 'empresa@x.cl', role: 'COMPANY', companyId: 'co1' } }));
  jest.mocked(useCompanyComplaints).mockReturnValue({ complaints: [complaint], loading: false, refreshing: false, error: null, refresh: jest.fn(), replaceComplaint: jest.fn() });
});

describe('CompanyComplaintsScreen', () => {
  it('muestra los reclamos recibidos con categoría, estado y filtros', async () => {
    await render(<CompanyComplaintsScreen />);

    expect(screen.getByRole('header', { name: 'Reclamos' })).toBeTruthy();
    expect(screen.getByText('Micro atrasada')).toBeTruthy();
    expect(screen.getByText('Categoría: Retraso')).toBeTruthy();
    expect(screen.getByText('Estado: Pendiente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Categorías:: Todas las categorías' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Estados:: Todos los estados' })).toBeTruthy();
  });

  it('vuelve a cargar al seleccionar un filtro', async () => {
    await render(<CompanyComplaintsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Estados:: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Resuelto' }));

    expect(useCompanyComplaints).toHaveBeenLastCalledWith('co1', { category: '', status: 'RESOLVED' });
  });

  it('permite responder un reclamo pendiente y pide confirmación antes de cerrarlo', async () => {
    const replaceComplaint = jest.fn();
    jest.mocked(useCompanyComplaints).mockReturnValue({ complaints: [complaint], loading: false, refreshing: false, error: null, refresh: jest.fn(), replaceComplaint });
    jest.mocked(complaintsApi.updateComplaintStatus).mockResolvedValue({ ...complaint, status: 'RESOLVED', adminResponse: 'Caso solucionado' });
    await render(<CompanyComplaintsScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Responder' }));
    expect(screen.getByRole('header', { name: 'Responder reclamo' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Respuesta para el pasajero'), 'Caso solucionado');
    await fireEvent.press(screen.getByRole('button', { name: 'Nuevo estado: En revisión' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Resuelto' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar respuesta' }));
    expect(screen.getByRole('header', { name: 'Confirmar cierre' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));
    expect(complaintsApi.updateComplaintStatus).toHaveBeenCalledWith('c1', { status: 'RESOLVED', adminResponse: 'Caso solucionado' });
    expect(replaceComplaint).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', status: 'RESOLVED' }));
  });

  it('permite editar una respuesta en revisión y conserva el formulario si el backend falla', async () => {
    jest.mocked(useCompanyComplaints).mockReturnValue({
      complaints: [{ ...complaint, status: 'IN_REVIEW', adminResponse: 'Primera respuesta' }],
      loading: false, refreshing: false, error: null, refresh: jest.fn(), replaceComplaint: jest.fn(),
    });
    jest.mocked(complaintsApi.updateComplaintStatus).mockRejectedValue(new Error('No se pudo actualizar el reclamo.'));
    await render(<CompanyComplaintsScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Editar respuesta' }));
    expect(screen.getByDisplayValue('Primera respuesta')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Respuesta para el pasajero'), 'Respuesta corregida');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar respuesta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar el reclamo.');
    expect(screen.getByRole('header', { name: 'Responder reclamo' })).toBeTruthy();
  });

  it('la confirmación reemplaza al formulario en la misma ventana (en iOS no se pueden apilar dos)', async () => {
    await render(<CompanyComplaintsScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Responder' }));
    await fireEvent.changeText(screen.getByLabelText('Respuesta para el pasajero'), 'Rechazado por falta de antecedentes');
    await fireEvent.press(screen.getByRole('button', { name: 'Nuevo estado: En revisión' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Rechazado' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar respuesta' }));

    expect(screen.getByRole('header', { name: 'Confirmar cierre' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Responder reclamo' })).toBeNull();

    // "Volver" regresa al formulario con lo escrito.
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByDisplayValue('Rechazado por falta de antecedentes')).toBeTruthy();
  });

  it('si falla al confirmar el cierre, vuelve al formulario y muestra el error', async () => {
    jest.mocked(complaintsApi.updateComplaintStatus).mockRejectedValue(new Error('Error al actualizar estado del reclamo'));
    await render(<CompanyComplaintsScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Responder' }));
    await fireEvent.changeText(screen.getByLabelText('Respuesta para el pasajero'), 'Caso solucionado');
    await fireEvent.press(screen.getByRole('button', { name: 'Nuevo estado: En revisión' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Resuelto' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar respuesta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al actualizar estado del reclamo');
    expect(screen.queryByRole('header', { name: 'Confirmar cierre' })).toBeNull();
    expect(screen.getByDisplayValue('Caso solucionado')).toBeTruthy();
  });

  it('con un filtro de estado, si el reclamo ya no corresponde se vuelve a pedir la lista', async () => {
    const refresh = jest.fn();
    const replaceComplaint = jest.fn();
    jest.mocked(useCompanyComplaints).mockReturnValue({ complaints: [complaint], loading: false, refreshing: false, error: null, refresh, replaceComplaint });
    jest.mocked(complaintsApi.updateComplaintStatus).mockResolvedValue({ ...complaint, status: 'IN_REVIEW', adminResponse: 'Lo revisamos' });
    await render(<CompanyComplaintsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Estados:: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Pendiente' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Responder' }));
    await fireEvent.changeText(screen.getByLabelText('Respuesta para el pasajero'), 'Lo revisamos');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar respuesta' }));

    expect(refresh).toHaveBeenCalled();
    expect(replaceComplaint).not.toHaveBeenCalled();
  });
});
