import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Complaint } from '../../api/complaintsApi';
import { useAuth } from '../../auth/AuthContext';
import { useCompanyComplaints } from '../../hooks/useCompanyComplaints';
import { mockAuthValue } from '../../test-utils/auth';
import { CompanyComplaintsScreen } from '../CompanyComplaintsScreen';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../hooks/useCompanyComplaints', () => ({ useCompanyComplaints: jest.fn() }));

const complaint: Complaint = {
  id: 'c1', title: 'Micro atrasada', description: 'Esperé 20 minutos', category: 'DELAY', status: 'PENDING',
  busId: 'b1', routeId: 'r1', companyId: 'co1', adminResponse: null, createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ status: 'signedIn', user: { id: 'u1', name: 'Empresa', email: 'empresa@x.cl', role: 'COMPANY', companyId: 'co1' } }));
  jest.mocked(useCompanyComplaints).mockReturnValue({ complaints: [complaint], loading: false, refreshing: false, error: null, refresh: jest.fn() });
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
});
