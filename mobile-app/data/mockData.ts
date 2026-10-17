// ============================================================
// TransitHub Mobile — Mock data for driver-mode
// Same fleet & routes as the web CompanyDriverModePage
// ============================================================

import type { DriverBus, DriverRoute } from '@/types';

export const MOCK_BUSES: DriverBus[] = [
  { id: 'bus-7a-01', plate: 'BGPK-45', capacity: 35, passengers: 14, status: 'Disponible' },
  { id: 'bus-7a-02', plate: 'CRTM-12', capacity: 35, passengers: 28, status: 'En servicio' },
  { id: 'bus-1c-01', plate: 'DKSL-90', capacity: 35, passengers: 8,  status: 'Disponible' },
  { id: 'bus-res-01', plate: 'FGRT-33', capacity: 35, passengers: 0,  status: 'Mantenimiento' },
];

export const MOCK_ROUTES: DriverRoute[] = [
  {
    id: 'route-7a',
    code: '7A',
    name: 'Cajón / Santa Rosa',
    stops: ['Terminal Cajón', 'Av. Alemania', 'Centro', 'Santa Rosa'],
    duration: '45 min',
  },
  {
    id: 'route-7b',
    code: '7B',
    name: 'San Antonio / Amanecer',
    stops: ['San Antonio', 'Hospital', 'Centro', 'Amanecer'],
    duration: '38 min',
  },
  {
    id: 'route-1c',
    code: '1C',
    name: 'Labranza / Centro',
    stops: ['Labranza', 'Padre Las Casas', 'Centro', 'Av. Caupolicán'],
    duration: '52 min',
  },
];
