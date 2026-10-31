import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { AdminUsersScreen } from '../AdminUsersScreen';

jest.mock('../../api/adminApi', () => ({ fetchUsers: jest.fn(), fetchCompanies: jest.fn(), updateUser: jest.fn(), deactivateUser: jest.fn(), createUser: jest.fn() }));
// La confirmación se acepta sola en los tests.
jest.mock('../../utils/platform', () => ({
  ...jest.requireActual('../../utils/platform'),
  confirmAction: jest.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm()),
}));
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

describe('AdminUsersScreen: gestión', () => {
  const saved = { id: 'u3', name: 'Valentina Pérez', email: 'val@gmail.com', role: 'COMPANY' as const, isActive: false, companyId: 'co1', createdAt: null };

  it('edita una cuenta: pasarla a Empresa pide elegir su empresa y manda solo los cambios', async () => {
    admin.updateUser.mockResolvedValue(saved);
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Valentina Pérez' }));

    expect(screen.getByRole('header', { name: '✏️ Editar Usuario' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Empresa:/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Rol: Pasajero' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Empresa' }));
    expect(screen.getByRole('button', { name: 'Empresa: Buses Ñielol' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Usuario Valentina Pérez actualizado')).toBeTruthy();
    expect(admin.updateUser).toHaveBeenCalledWith('u3', { role: 'COMPANY', companyId: 'co1' });
    expect(admin.fetchUsers).toHaveBeenCalledTimes(2);
  });

  it('crea una cuenta de Empresa con su contraseña inicial', async () => {
    admin.createUser.mockResolvedValue({ id: 'u9', name: 'Nuevo Operador', email: 'operador@nielol.cl', role: 'COMPANY', isActive: true, companyId: 'co1', createdAt: null });
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nuevo usuario' }));

    expect(screen.getByRole('header', { name: '➕ Nuevo Usuario' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Nuevo Operador');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'Operador@Nielol.cl');
    await fireEvent.changeText(screen.getByLabelText('Contraseña inicial'), 'corta');
    await fireEvent.press(screen.getByRole('button', { name: 'Rol: Pasajero' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Empresa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres')).toBeTruthy();
    expect(admin.createUser).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Contraseña inicial'), 'Inicial-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Usuario Nuevo Operador creado')).toBeTruthy();
    expect(admin.createUser).toHaveBeenCalledWith({ name: 'Nuevo Operador', email: 'operador@nielol.cl', password: 'Inicial-2026', role: 'COMPANY', companyId: 'co1' });
    expect(admin.updateUser).not.toHaveBeenCalled();
    expect(admin.fetchUsers).toHaveBeenCalledTimes(2);
  });

  it('si se crea sin "Usuario activo", la desactiva enseguida', async () => {
    admin.createUser.mockResolvedValue({ id: 'u9', name: 'Pasajero Nuevo', email: 'nuevo@gmail.com', role: 'PASSENGER', isActive: true, companyId: null, createdAt: null });
    admin.updateUser.mockResolvedValue({ id: 'u9', name: 'Pasajero Nuevo', email: 'nuevo@gmail.com', role: 'PASSENGER', isActive: false, companyId: null, createdAt: null });
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Pasajero Nuevo');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'nuevo@gmail.com');
    await fireEvent.changeText(screen.getByLabelText('Contraseña inicial'), 'Inicial-2026');
    await fireEvent(screen.getByLabelText('Usuario activo'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Usuario Pasajero Nuevo creado')).toBeTruthy();
    expect(admin.updateUser).toHaveBeenCalledWith('u9', { isActive: false });
  });

  it('muestra el aviso del backend si el correo ya existe (409)', async () => {
    admin.createUser.mockRejectedValue(new ApiError(409, 'El email otro@gmail.com ya está registrado'));
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Otra Persona');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'otro@gmail.com');
    await fireEvent.changeText(screen.getByLabelText('Contraseña inicial'), 'Inicial-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('El email otro@gmail.com ya está registrado')).toBeTruthy();
  });

  it('"Cancelar" cierra el formulario sin guardar', async () => {
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Valentina Pérez' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Otro nombre');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('header', { name: '✏️ Editar Usuario' })).toBeNull();
    expect(admin.updateUser).not.toHaveBeenCalled();
  });

  it('no deja usar el correo de otra cuenta', async () => {
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Valentina Pérez' }));
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'Claudia@nielol.cl');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText('El email claudia@nielol.cl ya está registrado')).toBeTruthy();
    expect(admin.updateUser).not.toHaveBeenCalled();
  });

  it('al quitarle el rol Empresa avisa que conserva su empresa', async () => {
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Claudia Torres' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Rol: Empresa' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Pasajero' }));

    expect(screen.getByText('La cuenta seguirá vinculada a su empresa anterior: el backend no permite quitarla.')).toBeTruthy();
  });

  it('en tu propia cuenta no se puede cambiar el rol ni desactivarla', async () => {
    await render(<AdminUsersScreen />);
    await screen.findByText('Mostrando 3 de 3 usuarios');

    expect(screen.queryByRole('button', { name: 'Desactivar Administrador Sistema' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Editar Administrador Sistema' }));
    expect(screen.getByText('Es tu cuenta: no puedes quitarte el rol ni desactivarla.')).toBeTruthy();
    // Solo queda el filtro de la pantalla, no un selector de rol en el formulario.
    expect(screen.queryByRole('button', { name: 'Rol: Admin' })).toBeNull();
    expect(screen.queryByLabelText('Usuario activo')).toBeNull();
  });

  it('un 500 del backend no muestra el error de la base de datos', async () => {
    admin.updateUser.mockRejectedValue(new ApiError(500, 'Error al actualizar parcialmente el usuario: ERROR: duplicate key'));
    await render(<AdminUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Editar Valentina Pérez' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Valentina P.');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('No se pudo guardar el usuario.')).toBeTruthy();
    expect(screen.queryByText(/duplicate key/)).toBeNull();
  });

  it('desactiva tras confirmar (DELETE) y activa sin confirmar (PATCH)', async () => {
    admin.deactivateUser.mockResolvedValue(undefined);
    admin.updateUser.mockResolvedValue(saved);
    await render(<AdminUsersScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Desactivar Claudia Torres' }));
    const { confirmAction } = jest.requireMock('../../utils/platform');
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Desactivar usuario', destructive: true }));
    expect(await screen.findByText('Usuario Claudia Torres desactivado')).toBeTruthy();
    expect(admin.deactivateUser).toHaveBeenCalledWith('u2');

    confirmAction.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Activar Valentina Pérez' }));
    expect(await screen.findByText('Usuario Valentina Pérez activado')).toBeTruthy();
    expect(admin.updateUser).toHaveBeenCalledWith('u3', { isActive: true });
    expect(confirmAction).not.toHaveBeenCalled();
  });
});
