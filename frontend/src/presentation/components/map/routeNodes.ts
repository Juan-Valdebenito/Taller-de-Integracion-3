export interface RouteNode {
  id: string;
  routeId: 'route-7A' | 'route-7B' | 'route-1C';
  name: string;
  position: [number, number];
}

export const ROUTE_NODES: RouteNode[] = [
  { id: '7a-hualpen', routeId: 'route-7A', name: 'Terminal Hualpén', position: [-38.7278, -72.6175] },
  { id: '7a-alemania', routeId: 'route-7A', name: 'Av. Alemania / Barros Arana', position: [-38.7335, -72.5900] },
  { id: '7a-plaza', routeId: 'route-7A', name: 'Plaza de Armas', position: [-38.7359, -72.5904] },
  { id: '7a-americas', routeId: 'route-7A', name: 'Av. Las Américas / Lautaro', position: [-38.7445, -72.5670] },
  { id: '7a-terminal-americas', routeId: 'route-7A', name: 'Terminal Las Américas', position: [-38.7490, -72.5608] },
  { id: '7b-pedro-valdivia', routeId: 'route-7B', name: 'Terminal Pedro de Valdivia', position: [-38.7085, -72.5820] },
  { id: '7b-villa-verde', routeId: 'route-7B', name: 'Sector Villa Verde', position: [-38.7188, -72.5837] },
  { id: '7b-plaza', routeId: 'route-7B', name: 'Plaza de Armas', position: [-38.7358, -72.5904] },
  { id: '7b-amanecer', routeId: 'route-7B', name: 'Terminal Amanecer', position: [-38.7508, -72.5932] },
  { id: '1c-padre-las-casas', routeId: 'route-1C', name: 'Terminal Padre Las Casas', position: [-38.7775, -72.5692] },
  { id: '1c-puente-cautin', routeId: 'route-1C', name: 'Puente Cautín', position: [-38.7632, -72.5758] },
  { id: '1c-plaza', routeId: 'route-1C', name: 'Plaza de Armas', position: [-38.7360, -72.5906] },
  { id: '1c-labranza', routeId: 'route-1C', name: 'Terminal Labranza', position: [-38.7410, -72.6288] },
];

export const ROUTE_NODE_COLORS: Record<RouteNode['routeId'], string> = {
  'route-7A': '#f97316',
  'route-7B': '#0ea5e9',
  'route-1C': '#22c55e',
};
