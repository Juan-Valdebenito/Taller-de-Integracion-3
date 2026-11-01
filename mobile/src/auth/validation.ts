/**
 * Validación de los formularios de autenticación. Replica las reglas de
 * backend-go (middleware ValidateUserPayload) para avisar antes de enviar;
 * el backend sigue siendo quien decide.
 */
import type { LoginInput, RegisterInput } from './types';

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Mismo mínimo que backend-go para el registro. */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function validateLogin({ email, password }: LoginInput): FieldErrors<LoginInput> {
  const errors: FieldErrors<LoginInput> = {};
  if (!email.trim()) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!isValidEmail(email)) {
    errors.email = 'El correo electrónico no es válido.';
  }
  if (!password) {
    errors.password = 'Ingresa tu contraseña.';
  }
  return errors;
}

export interface RegisterFormInput extends RegisterInput {
  confirmPassword: string;
}

export function validateRegister({ name, email, password, confirmPassword }: RegisterFormInput): FieldErrors<RegisterFormInput> {
  const errors: FieldErrors<RegisterFormInput> = {};
  if (!name.trim()) {
    errors.name = 'Ingresa tu nombre.';
  } else if (name.trim().length > 100) {
    errors.name = 'El nombre no puede superar los 100 caracteres.';
  }
  if (!email.trim()) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!isValidEmail(email)) {
    errors.email = 'El correo electrónico no es válido.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (confirmPassword !== password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
