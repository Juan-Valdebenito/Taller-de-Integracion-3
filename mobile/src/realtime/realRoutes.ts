import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '../api/client';
import { fetchRouteStops, type RouteStop } from '../api/companyApi';
import { DEFAULT_ROUTE_IDS, ROUTE_NAMES } from './liveBuses';

export interface RealRoute {
  id: string;
  code: string;
  name: string;
  label: string;
  stops: RouteStop[];
}

/** Líneas que el mapa ofrecía como respaldo antes del catálogo del backend. */
export const FALLBACK_ROUTES: RealRoute[] = DEFAULT_ROUTE_IDS.map((id) => ({
  id,
  code: id.replace('route-', ''),
  name: ROUTE_NAMES[id],
  label: `Línea ${id.replace('route-', '')}`,
  stops: [],
}));

export function routesWithFallback(real: readonly RealRoute[]): RealRoute[] {
  const merged = new Map(FALLBACK_ROUTES.map((route) => [route.id, route]));
  for (const route of real) merged.set(route.id, route);
  return [...merged.values()];
}

/** Rutas y paraderos activos de la base; nunca añade líneas locales de ejemplo. */
export async function fetchRealRoutes(): Promise<RealRoute[]> {
  const raw = await apiRequest<{ id?: string; code?: string; name?: string; isActive?: boolean }[] | null>('/routes');
  const routes = (Array.isArray(raw) ? raw : [])
    .filter((route) => route?.id && route.isActive === true)
    .map((route) => ({ id: String(route.id), code: String(route.code ?? ''), name: String(route.name ?? '') }));

  return Promise.all(routes.map(async (route) => {
    let stops: RouteStop[] = [];
    try {
      stops = await fetchRouteStops(route.id);
    } catch {
      // La ruta sigue siendo real; simplemente no se dibujan paraderos sin datos.
    }
    const label = route.code
      ? `Línea ${route.code}${route.name ? ` — ${route.name}` : ''}`
      : route.name || `Ruta ${route.id}`;
    return { ...route, label, stops };
  }));
}

/** Suscripciones solo a rutas activas registradas en el backend. */
export function routesToFollow(real: readonly RealRoute[]): string[] {
  return [...new Set([...DEFAULT_ROUTE_IDS, ...real.map((route) => route.id).filter(Boolean)])];
}

/** Nombres de ruta que llegan del catálogo del backend. */
export function realRouteNames(real: readonly RealRoute[]): Record<string, string> {
  return Object.fromEntries(real.map((route) => [
    route.id,
    route.name === ROUTE_NAMES[route.id] ? route.name : route.label,
  ]));
}

/**
 * Rutas activas para filtrar las micros y dibujar sus paraderos asociados.
 */
export function useRealRoutes(enabled = true): {
  routes: RealRoute[];
  routeIds: string[];
  routeNames: Record<string, string>;
  loading: boolean;
  error: string | null;
} {
  const [routes, setRoutes] = useState<RealRoute[]>(FALLBACK_ROUTES);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchRealRoutes()
      .then((result) => {
        if (active) {
          setRoutes(routesWithFallback(result));
          setError(result.length === 0 ? 'No hay rutas activas; se mantienen las líneas de respaldo.' : null);
        }
      })
      .catch(() => {
        if (active) {
          setRoutes(FALLBACK_ROUTES);
          setError('No se pudieron cargar las rutas del backend; se mantienen las líneas de respaldo.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return useMemo(() => ({
    routes,
    routeIds: routesToFollow(routes),
    routeNames: realRouteNames(routes),
    loading: enabled && loading,
    error,
  }), [enabled, error, loading, routes]);
}
