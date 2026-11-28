import type { RealRoute } from '../../realtime/realRoutes';

/** Filtro de ruta: todas o un ID del catálogo o de las líneas de respaldo. */
export type RouteFilterValue = string;

export interface RouteNode {
  id: string;
  routeIds: string[];
  name: string;
  /** [latitud, longitud]. */
  position: [number, number];
}

const FALLBACK_ROUTE_IDS = ['route-7A', 'route-7B', 'route-1C'] as const;
const FALLBACK_ROUTE_COLORS: Readonly<Record<string, string>> = {
  'route-7A': '#f97316',
  'route-7B': '#0ea5e9',
  'route-1C': '#22c55e',
};
const FALLBACK_ROUTE_LABELS: Readonly<Record<string, string>> = {
  'route-7A': 'Línea 7A',
  'route-7B': 'Línea 7B',
  'route-1C': 'Línea 1C',
};

/** Paradas originales disponibles cuando el catálogo todavía no tiene paraderos. */
const FALLBACK_ROUTE_NODES: readonly RouteNode[] = [
  { id: 'PAR-CJP-01', routeIds: ['route-7B'], name: 'Campus San Juan Pablo II', position: [-38.703959, -72.550509] },
  { id: 'PAR-CJP-02', routeIds: ['route-7A'], name: 'Avenida Rudecindo Ortega / Campus San Juan Pablo II', position: [-38.702598, -72.549241] },
  { id: 'PAR-BARROS-01', routeIds: ['route-1C'], name: 'Avenida Barros Arana / Loteo Valle Verde', position: [-38.708689, -72.550547] },
  { id: 'PAR-MRODRI-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Manuel Rodríguez / Galería Ñielol', position: [-38.736554, -72.587983] },
  { id: 'PAR-DPORT-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Diego Portales / McDonalds', position: [-38.737505, -72.589278] },
  { id: 'PAR-CSF-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Avenida Alemania / Campus San Francisco', position: [-38.736937, -72.601303] },
  { id: 'PAR-PORTAL-01', routeIds: ['route-7B', 'route-1C'], name: 'Avenida Alemania / Portal Temuco', position: [-38.734505, -72.611813] },
];

const ROUTE_NODE_PALETTE = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899', '#14b8a6'] as const;

/** Conserva los colores conocidos y asigna color estable a rutas nuevas. */
export function routeNodeColor(routeId: string): string {
  const fallbackColor = FALLBACK_ROUTE_COLORS[routeId];
  if (fallbackColor) return fallbackColor;
  let hash = 0;
  for (const character of routeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return ROUTE_NODE_PALETTE[hash % ROUTE_NODE_PALETTE.length];
}

/** Paraderos reales y, para rutas sin paraderos registrados, los originales. */
export function routeNodesForRoutes(routes: readonly RealRoute[]): RouteNode[] {
  const routesWithRealStops = new Set(routes.filter((route) => route.stops.length > 0).map((route) => route.id));
  const nodes: RouteNode[] = FALLBACK_ROUTE_NODES.flatMap((node) => {
    const routeIds = node.routeIds.filter((id) => FALLBACK_ROUTE_IDS.includes(id as (typeof FALLBACK_ROUTE_IDS)[number])
      && !routesWithRealStops.has(id));
    return routeIds.length > 0 ? [{ ...node, routeIds }] : [];
  });
  const nodesByKey = new Map<string, RouteNode>();

  for (const route of routes) {
    for (const stop of route.stops) {
      const { latitude, longitude } = stop;
      if (
        !stop.id
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180
      ) continue;

      const key = `${stop.id}:${latitude}:${longitude}`;
      const existing = nodesByKey.get(key);
      if (existing) {
        if (!existing.routeIds.includes(route.id)) existing.routeIds.push(route.id);
        continue;
      }

      nodesByKey.set(key, {
        id: key,
        routeIds: [route.id],
        name: stop.name || 'Paradero sin nombre',
        position: [latitude, longitude],
      });
    }
  }

  return [...nodes, ...nodesByKey.values()];
}

export function visibleRouteNodes(nodes: readonly RouteNode[], filter: RouteFilterValue): RouteNode[] {
  return filter === 'all' ? [...nodes] : nodes.filter((node) => node.routeIds.includes(filter));
}

export function routeLabelsOf(node: RouteNode, routes: readonly RealRoute[]): string {
  const labels = new Map<string, string>([
    ...Object.entries(FALLBACK_ROUTE_LABELS),
    ...routes.map((route) => [route.id, route.label] as [string, string]),
  ]);
  return node.routeIds.map((id) => labels.get(id) ?? `Ruta ${id}`).join(' · ');
}
