/**
 * Formulario de ruta (crear y editar), con los campos de RouteModal del web.
 * backend-go responde un 500 genérico si el código ya existe, así que la app
 * lo revisa antes contra las rutas cargadas.
 */
import type { NewRouteInput, RouteUpdateInput } from '../api/adminApi';
import type { CompanyRoute } from '../api/companyApi';

export interface RouteFormValues {
  code: string;
  name: string;
  companyId: string;
  description: string;
  /** "Ruta activa" (casilla del web). */
  isActive: boolean;
}

export const newRouteForm = (companyId = ''): RouteFormValues => ({ code: '', name: '', companyId, description: '', isActive: true });

export const formFromRoute = (route: CompanyRoute): RouteFormValues => ({
  code: route.code,
  name: route.name,
  companyId: route.companyId,
  description: route.description ?? '',
  isActive: route.isActive,
});

/** Mensaje de error o null si se puede guardar. `routes` sirve para no repetir el código. */
export function validateRouteForm(values: RouteFormValues, routes: readonly CompanyRoute[], editingId: string | null): string | null {
  const code = values.code.trim();
  if (!code) return 'El código de la ruta es obligatorio';
  if (code.length > 20) return 'El código no puede superar 20 caracteres';
  if (!values.name.trim()) return 'El nombre de la ruta es obligatorio';
  if (!values.companyId) return 'Elige la empresa que opera la ruta';
  const taken = routes.some((route) => route.id !== editingId && route.code.trim().toLowerCase() === code.toLowerCase());
  if (taken) return `Ya existe una ruta con el código ${code}`;
  return null;
}

export const toNewRouteInput = (values: RouteFormValues): NewRouteInput => ({
  code: values.code.trim(),
  name: values.name.trim(),
  description: values.description.trim() || null,
  companyId: values.companyId,
});

export const toRouteUpdateInput = (values: RouteFormValues): RouteUpdateInput => ({
  code: values.code.trim(),
  name: values.name.trim(),
  description: values.description.trim() || null,
  isActive: values.isActive,
});

/** Mensaje al fallar la eliminación: el backend la impide si la ruta tiene viajes, pero responde un error genérico. */
export const DELETE_ROUTE_FAILED =
  'No se pudo eliminar la ruta. Si tiene viajes registrados, el sistema no permite borrarla: desactívala en su lugar.';
