/**
 * Formulario de usuario, con los campos de UserModal del web: nombre, correo,
 * rol, empresa (solo para el rol Empresa) y "Usuario activo".
 * backend-go responde un 500 genérico si el correo ya existe, así que la app
 * lo revisa antes contra las cuentas cargadas.
 */
import type { AdminUser, UserPatch } from '../api/adminApi';
import type { UserRole } from '../auth/types';

export interface UserFormValues {
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  isActive: boolean;
}

/** Opciones del rol, en el orden del web. */
export const ROLE_OPTIONS: readonly { value: UserRole; label: string }[] = [
  { value: 'PASSENGER', label: 'Pasajero' },
  { value: 'COMPANY', label: 'Empresa' },
  { value: 'ADMIN', label: 'Admin' },
];

export const formFromUser = (user: AdminUser): UserFormValues => ({
  name: user.name,
  email: user.email,
  role: user.role,
  companyId: user.companyId ?? '',
  isActive: user.isActive,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserFormContext {
  users: readonly AdminUser[];
  /** Cuenta que se edita (null al crear). */
  editingId: string | null;
  /** Si es la cuenta del administrador que tiene la sesión abierta. */
  isSelf: boolean;
}

/** Mensaje de error o null si se puede guardar. */
export function validateUserForm(values: UserFormValues, { users, editingId, isSelf }: UserFormContext): string | null {
  const email = values.email.trim().toLowerCase();
  if (!values.name.trim()) return 'El nombre es obligatorio';
  if (!email) return 'El correo electrónico es obligatorio';
  if (!EMAIL.test(email)) return 'Ingresa un correo electrónico válido';
  if (users.some((user) => user.id !== editingId && user.email.trim().toLowerCase() === email)) return `El email ${email} ya está registrado`;
  if (values.role === 'COMPANY' && !values.companyId) return 'Elige la empresa a la que pertenece la cuenta';
  // Sin esto, el administrador podría dejarse fuera del panel.
  if (isSelf && values.role !== 'ADMIN') return 'No puedes quitarte el rol de administrador';
  if (isSelf && !values.isActive) return 'No puedes desactivar tu propia cuenta';
  return null;
}

/**
 * Cambios para PATCH /users/:id: solo lo que cambió. La empresa solo se
 * envía para el rol Empresa (backend-go no permite dejarla vacía).
 */
export function toUserPatch(values: UserFormValues, original: AdminUser): UserPatch {
  const patch: UserPatch = {};
  const name = values.name.trim();
  const email = values.email.trim().toLowerCase();
  if (name !== original.name) patch.name = name;
  if (email !== original.email.toLowerCase()) patch.email = email;
  if (values.role !== original.role) patch.role = values.role;
  if (values.isActive !== original.isActive) patch.isActive = values.isActive;
  if (values.role === 'COMPANY' && values.companyId !== (original.companyId ?? '')) patch.companyId = values.companyId;
  return patch;
}

/** Si la cuenta deja de ser Empresa conserva su empresa: el backend no permite quitarla. */
export const keepsOldCompany = (values: UserFormValues, original: AdminUser | null): boolean =>
  !!original?.companyId && values.role !== 'COMPANY';
