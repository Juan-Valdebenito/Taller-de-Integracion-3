import type { UserRole } from '../auth/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  PASSENGER: 'Pasajero',
  COMPANY: 'Empresa',
  ADMIN: 'Administrador',
};

export function roleLabel(role: string | undefined): string {
  return (role && ROLE_LABELS[role as UserRole]) || role || '';
}

/** Iniciales para el avatar: "Ana María Pérez" → "AP"; "ana" → "A". */
export function initials(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Fecha ISO → "16 de octubre de 2026" (hora local). Se formatea a mano para no
 * depender del soporte de Intl del motor JavaScript de cada dispositivo.
 */
export function formatLongDate(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}
