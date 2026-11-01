/**
 * "Resolución Oficial de Reclamo" del administrador (funciones puras), con los
 * botones de estado de AdminComplaintsView del web. Como en la bandeja de la
 * empresa, Resuelto y Rechazado quedan cerrados en la app (el backend
 * permitiría reabrirlos).
 */
import type { ComplaintStatus } from '../api/complaintsApi';

/** Botones de "Nuevo Estado del Incidente", con los textos del web. */
export const RESOLUTION_OPTIONS: readonly { value: ComplaintStatus; label: string }[] = [
  { value: 'IN_REVIEW', label: '🔍 En Revisión' },
  { value: 'RESOLVED', label: '✅ Resolver' },
  { value: 'REJECTED', label: '❌ Rechazar' },
];

/** Si el reclamo todavía se puede gestionar (pendiente o en revisión). */
export const canManage = (status: string): boolean => status === 'PENDING' || status === 'IN_REVIEW';

/** Estado elegido al abrir: como el web, un pendiente pasa a revisión. */
export const initialTarget = (status: string): ComplaintStatus => (status === 'PENDING' ? 'IN_REVIEW' : (status as ComplaintStatus));

/** Cerrar el reclamo (resolverlo o rechazarlo) se confirma, porque después no se puede reabrir. */
export const closesComplaint = (current: string, target: ComplaintStatus): boolean => current !== target && (target === 'RESOLVED' || target === 'REJECTED');

/** Mensaje de error o null si se puede guardar. */
export function validateResolution(response: string): string | null {
  return response.trim() ? null : 'Escribe una respuesta para el pasajero.';
}
