import type { AdminUser } from '../../api/adminApi';
import { formFromUser, keepsOldCompany, toUserPatch, validateUserForm } from '../userForm';

const users: AdminUser[] = [
  { id: 'u1', name: 'Administrador Sistema', email: 'admin@transporte.cl', role: 'ADMIN', isActive: true, companyId: null, createdAt: null },
  { id: 'u2', name: 'Claudia Torres', email: 'Claudia@Nielol.cl', role: 'COMPANY', isActive: true, companyId: 'co1', createdAt: null },
  { id: 'u3', name: 'Valentina Pérez', email: 'val@gmail.com', role: 'PASSENGER', isActive: false, companyId: null, createdAt: null },
];
const other = { users, editingId: 'u3', isSelf: false };

describe('validateUserForm', () => {
  it('acepta una cuenta válida', () => {
    expect(validateUserForm(formFromUser(users[2]!), other)).toBeNull();
  });

  it('pide nombre y un correo válido que no esté usado por otra cuenta', () => {
    const base = formFromUser(users[2]!);
    expect(validateUserForm({ ...base, name: ' ' }, other)).toBe('El nombre es obligatorio');
    expect(validateUserForm({ ...base, email: '' }, other)).toBe('El correo electrónico es obligatorio');
    expect(validateUserForm({ ...base, email: 'val@gmail' }, other)).toBe('Ingresa un correo electrónico válido');
    expect(validateUserForm({ ...base, email: ' claudia@nielol.CL ' }, other)).toBe('El email claudia@nielol.cl ya está registrado');
  });

  it('el rol Empresa necesita una empresa', () => {
    expect(validateUserForm({ ...formFromUser(users[2]!), role: 'COMPANY', companyId: '' }, other)).toBe('Elige la empresa a la que pertenece la cuenta');
  });

  it('el administrador no puede quitarse el rol ni desactivarse', () => {
    const self = { users, editingId: 'u1', isSelf: true };
    expect(validateUserForm({ ...formFromUser(users[0]!), role: 'PASSENGER' }, self)).toBe('No puedes quitarte el rol de administrador');
    expect(validateUserForm({ ...formFromUser(users[0]!), isActive: false }, self)).toBe('No puedes desactivar tu propia cuenta');
    expect(validateUserForm({ ...formFromUser(users[0]!), name: 'Otro nombre' }, self)).toBeNull();
  });
});

describe('toUserPatch', () => {
  it('sin cambios no envía nada (el correo se compara sin mayúsculas)', () => {
    expect(toUserPatch({ ...formFromUser(users[1]!), email: 'claudia@nielol.cl' }, users[1]!)).toEqual({});
  });

  it('envía solo lo que cambió, con nombre recortado y correo en minúsculas', () => {
    expect(toUserPatch({ ...formFromUser(users[2]!), name: ' Valentina P. ', email: 'VAL2@gmail.com', isActive: true }, users[2]!)).toEqual({
      name: 'Valentina P.',
      email: 'val2@gmail.com',
      isActive: true,
    });
  });

  it('la empresa solo se envía para el rol Empresa', () => {
    expect(toUserPatch({ ...formFromUser(users[2]!), role: 'COMPANY', companyId: 'co1' }, users[2]!)).toEqual({ role: 'COMPANY', companyId: 'co1' });
    expect(toUserPatch({ ...formFromUser(users[1]!), role: 'PASSENGER' }, users[1]!)).toEqual({ role: 'PASSENGER' });
  });

  it('avisa que una cuenta que deja de ser Empresa conserva su empresa', () => {
    expect(keepsOldCompany({ ...formFromUser(users[1]!), role: 'PASSENGER' }, users[1]!)).toBe(true);
    expect(keepsOldCompany(formFromUser(users[1]!), users[1]!)).toBe(false);
    expect(keepsOldCompany(formFromUser(users[2]!), users[2]!)).toBe(false);
  });
});
