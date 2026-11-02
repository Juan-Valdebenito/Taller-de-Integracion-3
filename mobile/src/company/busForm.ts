/**
 * Formulario de micro (crear y editar), con los textos y validaciones de
 * CompanyBusesPage del web más el formato de patente que exige backend-go
 * (IsValidPatente: ABCD-12 o AB-1234).
 */
import type { CompanyBus } from '../api/companyApi';

export interface BusFormValues {
  patente: string;
  /** Texto del campo; se valida como entero > 0. */
  capacity: string;
  /** '' = sin ruta asignada. */
  routeId: string;
  status: CompanyBus['status'];
}

/** Valores al abrir "Registrar Nueva Micro" (35 asientos y en servicio, como el web). */
export const NEW_BUS_FORM: BusFormValues = { patente: '', capacity: '35', routeId: '', status: 'ACTIVE' };

export const formFromBus = (bus: CompanyBus): BusFormValues => ({
  patente: bus.patente,
  capacity: String(bus.capacity),
  routeId: bus.routeId ?? '',
  status: bus.status,
});

/** Opciones de "Estado Operacional" del web (más "Fuera de servicio" del backend). */
export const BUS_STATUS_OPTIONS: readonly { value: CompanyBus['status']; label: string }[] = [
  { value: 'ACTIVE', label: 'En Servicio (Operando en Calle)' },
  { value: 'MAINTENANCE', label: 'En Taller (Mantenimiento Mecánico)' },
  { value: 'INACTIVE', label: 'Inactiva (Fuera de Servicio)' },
  { value: 'OUT_OF_SERVICE', label: 'Fuera de servicio (Dada de baja temporal)' },
];

const MODERN = /^[A-Z]{4}-?[0-9]{2}$/;
const CLASSIC = /^[A-Z]{2}-?[0-9]{4}$/;

/** Patente con el guion donde lo pone backend-go: "bgpk45" → "BGPK-45", "ab1234" → "AB-1234". */
export function formatPlate(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/-/g, '');
  if (CLASSIC.test(clean)) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  if (MODERN.test(clean)) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return raw.trim().toUpperCase();
}

export const isValidPlate = (raw: string) => {
  const clean = raw.trim().toUpperCase();
  return MODERN.test(clean) || CLASSIC.test(clean);
};

/** Mensaje de error del formulario (los del web), o null si se puede guardar. */
export function validateBusForm(values: BusFormValues): string | null {
  if (!values.patente.trim()) return 'La patente es requerida (ej: ABCD-12).';
  if (!isValidPlate(values.patente)) return 'Formato de patente inválido. Formatos aceptados: ABCD-12 o AB-1234.';
  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) return 'La capacidad debe ser un número entero mayor a 0.';
  return null;
}
