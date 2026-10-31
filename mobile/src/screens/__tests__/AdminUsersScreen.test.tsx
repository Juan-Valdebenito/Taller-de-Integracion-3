import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { AdminUsersScreen } from '../AdminUsersScreen';

jest.mock('../../api/adminApi', () => ({ fetchUsers: jest.fn(), fetchCompanies: jest.fn() }));
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));

const admin = jest.mocked(adminApi);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Admin', email: 'admin@transporte.cl', role: 'ADMIN' } } as ReturnType<typeof useAuth>);
  admin.fetchUsers.mockResolvedValue([
    { id: 'u1', name: 'Administrador Sistema', email: 'admin@transporte.cl', role: 'ADMIN', isActive: true, companyId: null, createdAt: '2025-01-15T12:00:00Z' },
    { id: 'u2', name: 'Claudia Torres', email: 'claudia@nielol.cl', role: 'COMPANY', isActive: true, companyId: 'co1', createdAt: '2025-02-03T12:00:00Z' },
    { id: 'u3', name: 'Valentina Pérez', email: 'val@gmail.com', role: 'PASSENGER', isActive: false, companyId: null, createdAt: '2025-03-20T12:00:00Z' },
  ]);
  admin.fetchCompanies.mockResolvedValue([{ id: 'co1', name: 'Buses Ñielol', rut: '', email: '', phone: null, address: null, isActive: true }]);
});

describe('useAdminUsers', () => {
  it('si fallan las empresas, igual muestra los usuarios con el id de su empresa', async () => {
    admin.fetchCompanies.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.users).toHaveLength(3));
    expect(result.current.users[1]!.companyName).toBe('co1');
    expect(result.current.error).toBeNull();
  });

  it('si fallan los usuarios muestra el error', async () => {
    admin.fetchUsers.mockRejectedValue(new ApiError(500, 'Error al obtener usuarios'));
    const { result } = await renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.error).toBe('Error al obtener usuarios'));
  });
});

describe('AdminUsersScreen', () => {
  it('muestra el encabezado, los chips del web y una tarjeta por usuario', async () => {
    await render(<AdminUsersScreen />);

    expect(screen.getByRole('header', { name: 'Gestión de Usuarios' })).toBeTruthy();
    expect(await screen.findByText('3 usuarios registrados en el sistema')).toBeTruthy();
    for (const chip of ['1 Admins', '1 Empresas', '1 Pasajeros', '1 Inactivos']) expect(screen.getByText(chip)).toBeTruthy();
    expect(screen.getByLabelText('Administrador Sistema (tú), admin@transporte.cl, Admin, activo, registrado 15-01-2025')).toBeTruthy();
    expect(screen.getByLabelText('Claudia Torres, claudia@nielol.cl, Empresa de Buses Ñielol, activo, registrado 03-02-2025')).toBeTruthy();
    expect(screen.getByLabelText('Valentina Pérez, val@gmail.com, Pasajero, inactivo, registrado 20-03-2025')).toBeTruthy();
    expect(screen.getByText('AS')).toBeTruthy();
    expect(screen.getByText('Mostrando 3 de 3 usuarios')).toBeTruthy();
  });

  it('busca y filtra por rol y estado', async () => {
    await render(<AdminUsersScreen />);
    await screen.findByText('Mostrando 3 de 3 usuarios');

    await fireEvent.changeText(screen.getByLabelText('Buscar usuario'), 'perez');
    expect(screen.getByText('Mostrando 1 de 3 usuarios')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Buscar usuario'), '');

    await fireEvent.press(screen.getByRole('button', { name: 'Rol: Todos los roles' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Empresa' }));
    expect(screen.getByText('Mostrando 1 de 3 usuarios')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactivo' }));
    expect(screen.getByText('No se encontraron usuarios')).toBeTruthy();
  });

  it('muestra el error si no se pueden cargar', async () => {
    admin.fetchUsers.mockRejectedValue(new ApiError(500, 'Error al obtener usuarios'));
    await render(<AdminUsersScreen />);
    expect(await screen.findByText('Error al obtener usuarios')).toBeTruthy();
  });
});
