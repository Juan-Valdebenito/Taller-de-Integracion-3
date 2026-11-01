/**
 * Formulario de empresa (crear y editar), con los campos de CompanyModal del
 * web y las mismas reglas que valida backend-go (internal/domain/company.go),
 * para avisar antes de enviar.
 */
import type { CompanyInput, CompanySummary } from '../api/adminApi';

export interface CompanyFormValues {
  name: string;
  rut: string;
  email: string;
  phone: string;
  address: string;
  /** "Empresa activa" (casilla del web). */
  isActive: boolean;
}

export const NEW_COMPANY_FORM: CompanyFormValues = { name: '', rut: '', email: '', phone: '', address: '', isActive: true };

export const formFromCompany = (company: CompanySummary): CompanyFormValues => ({
  name: company.name,
  rut: company.rut,
  email: company.email,
  phone: company.phone ?? '',
  address: company.address ?? '',
  isActive: company.isActive,
});

/** Campos del web, en su orden, con sus ejemplos. */
export const COMPANY_FIELDS: readonly { key: 'name' | 'rut' | 'email' | 'phone' | 'address'; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Nombre de la empresa', placeholder: 'Buses XYZ S.A.' },
  { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
  { key: 'email', label: 'Correo electrónico', placeholder: 'contacto@empresa.cl' },
  { key: 'phone', label: 'Teléfono (opcional)', placeholder: '+56 45 234 5678' },
  { key: 'address', label: 'Dirección (opcional)', placeholder: 'Av. Alemania 0100, Temuco' },
];

/** Dígito verificador de un RUT chileno (módulo 11), igual que backend-go. */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
}

/** RUT con puntos y guion si es válido ("761234567" → "76.123.456-7"); null si no lo es. */
export function formatRut(raw: string): string | null {
  const clean = raw.trim().toUpperCase().replace(/[.\-\s]/g, '');
  const match = /^(\d{1,8})([\dK])$/.exec(clean);
  if (!match) return null;
  const body = match[1].replace(/^0+/, '');
  if (!body || rutCheckDigit(body) !== match[2]) return null;
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${match[2]}`;
}

/** Mensaje de error (los mismos textos que responde backend-go) o null si se puede guardar. */
export function validateCompanyForm(values: CompanyFormValues): string | null {
  const name = values.name.trim();
  if (!name) return 'El nombre de la empresa es obligatorio';
  if ([...name].length > 120) return 'El nombre de la empresa no puede superar 120 caracteres';
  if (!formatRut(values.rut)) return 'El RUT no es válido (ej: 76.123.456-7)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return 'El correo electrónico no es válido';
  const phone = values.phone.trim();
  if (phone && (phone.length > 30 || !/^[\d +\-()]+$/.test(phone))) {
    return 'El teléfono solo puede tener números, espacios, + y guiones (máximo 30 caracteres)';
  }
  if ([...values.address.trim()].length > 200) return 'La dirección no puede superar 200 caracteres';
  return null;
}

/** Datos para el backend: textos recortados, RUT con formato y vacíos como null. */
export function toCompanyInput(values: CompanyFormValues): CompanyInput {
  return {
    name: values.name.trim(),
    rut: formatRut(values.rut) ?? values.rut.trim(),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
  };
}
