export interface RouteNode {
  id: string;
  routeIds: Array<'route-7A' | 'route-7B' | 'route-1C'>;
  name: string;
  position: [number, number];
}

export const ROUTE_NODES: RouteNode[] = [
  { id: 'PAR-CJP-01', routeIds: ['route-7B'], name: 'Campus San Juan Pablo II', position: [-38.703959, -72.550509] },
  { id: 'PAR-CJP-02', routeIds: ['route-7A'], name: 'Avenida Rudecindo Ortega / Campus San Juan Pablo II', position: [-38.702598, -72.549241] },
  { id: 'PAR-BARROS-01', routeIds: ['route-1C'], name: 'Avenida Barros Arana / Loteo Valle Verde', position: [-38.708689, -72.550547] },
  { id: 'PAR-MRODRI-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Manuel Rodríguez / Galería Ñielol', position: [-38.736554, -72.587983] },
  { id: 'PAR-DPORT-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Diego Portales / McDonalds', position: [-38.737505, -72.589278] },
  { id: 'PAR-CSF-01', routeIds: ['route-7A', 'route-7B', 'route-1C'], name: 'Avenida Alemania / Campus San Francisco', position: [-38.736937, -72.601303] },
  { id: 'PAR-PORTAL-01', routeIds: ['route-7B', 'route-1C'], name: 'Avenida Alemania / Portal Temuco', position: [-38.734505, -72.611813] },
];

export const ROUTE_NODE_COLORS: Record<'route-7A' | 'route-7B' | 'route-1C', string> = {
  'route-7A': '#f97316',
  'route-7B': '#0ea5e9',
  'route-1C': '#22c55e',
};
