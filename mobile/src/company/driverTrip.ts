/**
 * Reglas del modo conductor (funciones puras). El web (CompanyDriverModePage)
 * usa micros y rutas escritas en el código; aquí son las de la empresa en
 * backend-go, con los mismos textos.
 */
import type { CompanyBus, CompanyRoute } from '../api/companyApi';

/** Estado de cada micro con las palabras del web ("Disponible", "En servicio", "Mantenimiento"). */
export const DRIVER_BUS_STATUS: Readonly<Record<CompanyBus['status'], string>> = {
  INACTIVE: 'Disponible',
  ACTIVE: 'En servicio',
  MAINTENANCE: 'Mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
};

/** Como el web: una micro en mantenimiento (o fuera de servicio) no puede salir a recorrido. */
export const canDrive = (bus: Pick<CompanyBus, 'status'>) => bus.status === 'INACTIVE' || bus.status === 'ACTIVE';

/** "BGPK-45 · Disponible", la opción del selector "Unidad asignada". */
export const busOptionLabel = (bus: Pick<CompanyBus, 'patente' | 'status'>) => `${bus.patente} · ${DRIVER_BUS_STATUS[bus.status] ?? bus.status}`;

/** "Línea 7A · Cajón / Santa Rosa", la opción del selector "Recorrido". */
export const routeOptionLabel = (route: Pick<CompanyRoute, 'code' | 'name'>) => `Línea ${route.code} · ${route.name}`;

/** Solo las rutas activas se pueden recorrer. */
export const drivableRoutes = (routes: readonly CompanyRoute[]) => routes.filter((route) => route.isActive);

/**
 * Micro elegida por defecto: la que eligió el conductor si sigue pudiendo
 * salir; si no, la primera disponible (antes que una ya en servicio).
 */
export function defaultBus(buses: readonly CompanyBus[], chosenId: string | null): CompanyBus | null {
  const chosen = buses.find((bus) => bus.id === chosenId);
  if (chosen && canDrive(chosen)) return chosen;
  return buses.find((bus) => bus.status === 'INACTIVE') ?? buses.find(canDrive) ?? null;
}

/** Ruta elegida por defecto: la elegida si está activa; si no, la que ya tiene la micro, o la primera activa. */
export function defaultRoute(routes: readonly CompanyRoute[], chosenId: string | null, bus: CompanyBus | null): CompanyRoute | null {
  const active = drivableRoutes(routes);
  return active.find((route) => route.id === chosenId) ?? active.find((route) => route.id === bus?.routeId) ?? active[0] ?? null;
}
