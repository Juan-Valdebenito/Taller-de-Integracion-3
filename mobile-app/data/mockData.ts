// ============================================================
// TransitHub Mobile — Mock data for driver-mode
// Same fleet & routes as the web CompanyDriverModePage
// ============================================================

import type { DriverBus, DriverRoute } from '@/types';

// ── Driver profile ──────────────────────────────────────────
export const DRIVER_PROFILE = {
  id: 'drv-001',
  name: 'Carlos Muñoz R.',
  email: 'carlos.munoz@transithub.cl',
  role: 'Conductor' as const,
  company: 'Buses Bío Bío Ltda.',
  companyId: 'comp-001',
  avatar: null, // Using initials instead
  tripsToday: 3,
  tripsTotal: 847,
  rating: 4.8,
  hoursToday: 6.5,
  licenseExpiry: '2027-03-15',
  shift: 'Turno AM (06:00 – 14:30)',
};

// ── Buses ───────────────────────────────────────────────────
export const MOCK_BUSES: DriverBus[] = [
  { id: 'bus-7a-01', plate: 'BGPK-45', capacity: 35, passengers: 14, status: 'Disponible' },
  { id: 'bus-7a-02', plate: 'CRTM-12', capacity: 35, passengers: 28, status: 'En servicio' },
  { id: 'bus-1c-01', plate: 'DKSL-90', capacity: 35, passengers: 8,  status: 'Disponible' },
  { id: 'bus-res-01', plate: 'FGRT-33', capacity: 35, passengers: 0,  status: 'Mantenimiento' },
];

// ── Routes ──────────────────────────────────────────────────
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

// ── Trip history (last recorridos) ──────────────────────────
export const TRIP_HISTORY = [
  {
    id: 'trip-001',
    routeCode: '7A',
    routeName: 'Cajón / Santa Rosa',
    busPlate: 'BGPK-45',
    startTime: '06:15',
    endTime: '07:02',
    duration: '47 min',
    passengers: 32,
    status: 'completed' as const,
    date: '2026-10-24',
  },
  {
    id: 'trip-002',
    routeCode: '7A',
    routeName: 'Cajón / Santa Rosa',
    busPlate: 'BGPK-45',
    startTime: '07:30',
    endTime: '08:14',
    duration: '44 min',
    passengers: 41,
    status: 'completed' as const,
    date: '2026-10-24',
  },
  {
    id: 'trip-003',
    routeCode: '7B',
    routeName: 'San Antonio / Amanecer',
    busPlate: 'CRTM-12',
    startTime: '09:00',
    endTime: '09:40',
    duration: '40 min',
    passengers: 28,
    status: 'completed' as const,
    date: '2026-10-24',
  },
];

// ── Live alert events ───────────────────────────────────────
export const ALERT_EVENTS = [
  {
    id: 'alert-1',
    type: 'traffic' as const,
    title: 'Tráfico alto',
    description: 'Av. Caupolicán entre Manuel Montt y Portales — espera ~8 min',
    time: '08:42',
    severity: 'warning' as const,
  },
  {
    id: 'alert-2',
    type: 'detour' as const,
    title: 'Desvío activo',
    description: 'Balmaceda cortada por obras municipales. Desviar por O\'Higgins.',
    time: '07:15',
    severity: 'danger' as const,
  },
  {
    id: 'alert-3',
    type: 'info' as const,
    title: 'Frecuencia ajustada',
    description: 'Línea 1C opera cada 18 min durante hora valle (09:30 – 12:00)',
    time: '09:30',
    severity: 'info' as const,
  },
];
