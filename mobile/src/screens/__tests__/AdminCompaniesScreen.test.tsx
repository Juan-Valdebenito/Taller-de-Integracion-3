import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import * as companyApi from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useAdminCompanies } from '../../hooks/useAdminCompanies';
import { AdminCompaniesScreen } from '../AdminCompaniesScreen';

jest.mock('../../api/adminApi', () => ({
  fetchCompanies: jest.fn(),
  fetchPendingComplaintsByCompany: jest.fn(),
  createCompany: jest.fn(),
  updateCompany: jest.fn(),
  setCompanyActive: jest.fn(),
}));
// La confirmación se acepta sola en los tests.
jest.mock('../../utils/platform', () => ({
  ...jest.requireActual('../../utils/platform'),
  confirmAction: jest.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm()),
}));
jest.mock('../../api/companyApi', () => ({ fetchCompanyBuses: jest.fn(), fetchCompanyRoutes: jest.fn() }));

const admin = jest.mocked(adminApi);
const demo = { id: 'company-demo', name: 'Empresa Demo', rut: '76.000.000-0', email: 'demo@empresa.cl', phone: '+56 45 222 3333', address: 'Av. Alemania 0100, Temuco', isActive: true };
const nielol = { id: 'co2', name: 'Buses Ñielol', rut: '12.345.678-5', email: 'contacto@nielol.cl', phone: null, address: null, isActive: true };
const company = jest.mocked(companyApi);

beforeEach(() => {
  jest.clearAllMocks();
  admin.fetchCompanies.mockResolvedValue([demo, nielol]);
  admin.fetchPendingComplaintsByCompany.mockResolvedValue({ 'company-demo': 2 });
  company.fetchCompanyBuses.mockResolvedValue([
    { id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 0, status: 'ACTIVE', companyId: 'company-demo' },
  ]);
  company.fetchCompanyRoutes.mockResolvedValue([{ id: 'r1', code: 'L1', name: 'Centro', isActive: true, companyId: 'company-demo' }]);
});

describe('useAdminCompanies', () => {
  it('si fallan las cifras, igual muestra las empresas (en cero)', async () => {
    company.fetchCompanyBuses.mockRejectedValue(new Error('caído'));
    admin.fetchPendingComplaintsByCompany.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useAdminCompanies());

    await waitFor(() => expect(result.current.companies).toHaveLength(2));
    expect(result.current.companies[0]).toMatchObject({ buses: 0, routes: 1, pendingComplaints: 0 });
    expect(result.current.error).toBeNull();
  });

  it('si fallan las empresas muestra el error', async () => {
    admin.fetchCompanies.mockRejectedValue(new ApiError(403, 'No tienes permiso para realizar esta acción.'));
    const { result } = await renderHook(() => useAdminCompanies());

    await waitFor(() => expect(result.current.error).toBe('No tienes permiso para realizar esta acción.'));
    await act(async () => {});
  });
});

describe('AdminCompaniesScreen', () => {
  it('muestra el encabezado del web y una tarjeta por empresa con cifras reales', async () => {
    await render(<AdminCompaniesScreen />);

    expect(screen.getByRole('header', { name: 'Empresas de Transporte' })).toBeTruthy();
    expect(await screen.findByText('2 activas de 2 registradas')).toBeTruthy();
    expect(screen.getByLabelText('Empresa Demo, activa: 1 micros, 1 rutas, 2 reclamos pendientes')).toBeTruthy();
    expect(screen.getByLabelText('Buses Ñielol, activa: 0 micros, 0 rutas, 0 reclamos pendientes')).toBeTruthy();
  });

  it('busca por nombre y avisa si no hay resultados', async () => {
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.changeText(screen.getByLabelText('Buscar empresa'), 'nielol');
    expect(screen.queryByLabelText(/^Empresa Demo/)).toBeNull();
    expect(screen.getByLabelText(/^Buses Ñielol/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Buscar empresa'), 'zzz');
    expect(screen.getByText('No se encontraron empresas')).toBeTruthy();
  });

  it('filtra por estado', async () => {
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactivas' }));
    expect(screen.getByText('No se encontraron empresas')).toBeTruthy();
  });

  it('muestra el RUT y los datos de contacto de cada empresa', async () => {
    await render(<AdminCompaniesScreen />);

    expect(await screen.findByText('76.000.000-0')).toBeTruthy();
    expect(screen.getByText('📧 demo@empresa.cl')).toBeTruthy();
    expect(screen.getByText('📞 +56 45 222 3333')).toBeTruthy();
    expect(screen.getByText('📍 Av. Alemania 0100, Temuco')).toBeTruthy();
    // Sin teléfono ni dirección no se muestran esas filas.
    expect(screen.queryAllByText(/^📞/)).toHaveLength(1);
  });

  it('"Nueva empresa" crea la empresa en el backend y muestra el aviso', async () => {
    admin.createCompany.mockResolvedValue({ ...nielol, id: 'nueva', name: 'Buses Labranza', rut: '10.000.013-K', email: 'labranza@buses.cl' });
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Nueva empresa' }));
    expect(screen.getByRole('header', { name: '➕ Nueva Empresa' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nombre de la empresa'), ' Buses Labranza ');
    await fireEvent.changeText(screen.getByLabelText('RUT'), '10000013k');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'Labranza@Buses.CL');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear empresa' }));

    expect(await screen.findByText('Empresa Buses Labranza registrada')).toBeTruthy();
    expect(admin.createCompany).toHaveBeenCalledWith({ name: 'Buses Labranza', rut: '10.000.013-K', email: 'labranza@buses.cl', phone: null, address: null });
    expect(admin.setCompanyActive).not.toHaveBeenCalled();
    expect(admin.fetchCompanies).toHaveBeenCalledTimes(2);
  });

  it('no envía un RUT inválido, y muestra el error del backend (RUT repetido)', async () => {
    admin.createCompany.mockRejectedValue(new ApiError(409, 'ya existe una empresa con ese RUT'));
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Nueva empresa' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre de la empresa'), 'Otra');
    await fireEvent.changeText(screen.getByLabelText('RUT'), '76.000.000-1');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'otra@x.cl');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear empresa' }));
    expect(screen.getByText('El RUT no es válido (ej: 76.123.456-7)')).toBeTruthy();
    expect(admin.createCompany).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('RUT'), '76.000.000-0');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear empresa' }));
    expect(await screen.findByText('ya existe una empresa con ese RUT')).toBeTruthy();
  });

  it('"Editar" carga los datos, guarda los cambios y, si se apagó "Empresa activa", la desactiva', async () => {
    admin.updateCompany.mockImplementation(async (id, input) => ({ ...demo, ...input, id }));
    admin.setCompanyActive.mockResolvedValue({ ...demo, isActive: false });
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Editar Empresa Demo' }));
    expect(screen.getByRole('header', { name: '✏️ Editar Empresa' })).toBeTruthy();
    expect(screen.getByLabelText('RUT').props.value).toBe('76.000.000-0');
    await fireEvent.changeText(screen.getByLabelText('Nombre de la empresa'), 'Empresa Demo SpA');
    await fireEvent(screen.getByRole('switch', { name: 'Empresa activa' }), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Empresa Empresa Demo SpA actualizada')).toBeTruthy();
    expect(admin.updateCompany).toHaveBeenCalledWith('company-demo', expect.objectContaining({ name: 'Empresa Demo SpA', rut: '76.000.000-0' }));
    expect(admin.setCompanyActive).toHaveBeenCalledWith('company-demo', false);
  });

  it('"Desactivar" pide confirmación, cambia el estado en el backend y avisa', async () => {
    admin.setCompanyActive.mockResolvedValue({ ...demo, isActive: false });
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Desactivar Empresa Demo' }));

    const { confirmAction } = jest.requireMock('../../utils/platform');
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Desactivar empresa', destructive: true }));
    expect(admin.setCompanyActive).toHaveBeenCalledWith('company-demo', false);
    expect(await screen.findByText('Empresa Empresa Demo desactivada')).toBeTruthy();
  });

  it('"Activar" una inactiva no pide confirmación, y si falla muestra el error', async () => {
    admin.fetchCompanies.mockResolvedValue([{ ...nielol, isActive: false }]);
    admin.setCompanyActive.mockRejectedValue(new ApiError(500, 'Error al cambiar el estado de la empresa'));
    await render(<AdminCompaniesScreen />);
    await screen.findByText('0 activas de 1 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Activar Buses Ñielol' }));

    const { confirmAction } = jest.requireMock('../../utils/platform');
    expect(confirmAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Error al cambiar el estado de la empresa')).toBeTruthy();
  });
});
