import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '../api/client';
import { DEFAULT_ROUTE_IDS } from './liveBuses';

export interface RealRoute {
  id: string;
  code: string;
  name: string;
}

/** Rutas activas de la base (GET /routes); [] si no se pueden consultar. */
export async function fetchRealRoutes(): Promise<RealRoute[]> {
  const raw = await apiRequest<Array<{ id?: string; code?: string; name?: string; isActive?: boolean }> | null>('/routes');
  return (Array.isArray(raw) ? raw : [])
    .filter((route) => route?.id && route.isActive !== false)
    .map((route) => ({ id: String(route.id), code: String(route.code ?? ''), name: String(route.name ?? '') }));
}

/** Rutas a escuchar: las 3 líneas del web más las reales, sin repetir. */
export function routesToFollow(real: readonly RealRoute[]): string[] {
  return [...new Set([...DEFAULT_ROUTE_IDS, ...real.map((route) => route.id)])];
}

/** "Línea L1-DEMO — Línea 1 Centro", como los nombres de las 3 líneas del web. */
export function realRouteNames(real: readonly RealRoute[]): Record<string, string> {
  return Object.fromEntries(real.map((route) => [route.id, route.code ? `Línea ${route.code} — ${route.name}` : route.name || `Ruta ${route.id}`]));
}

/**
 * Rutas reales para el mapa del pasajero: así ve también las micros que
 * publican los conductores (modo conductor), no solo las 3 líneas del web.
 */
export function useRealRoutes(enabled = true): { routeIds: string[]; routeNames: Record<string, string> } {
  const [routes, setRoutes] = useState<RealRoute[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchRealRoutes()
      .then((result) => {
        if (active) setRoutes(result);
      })
      .catch(() => {
        // Sin rutas reales el mapa sigue con las 3 líneas del web.
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return useMemo(() => ({ routeIds: routesToFollow(routes), routeNames: realRouteNames(routes) }), [routes]);
}
