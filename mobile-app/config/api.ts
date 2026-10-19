// ============================================================
// TransitHub Mobile — API config
// ============================================================

// In development, when running in Expo Go the emulator / device
// cannot reach "localhost" from within the app. Android emulators
// use 10.0.2.2 and iOS simulators use 127.0.0.1. For a physical
// device use the LAN IP of the dev machine.
//
// In production, replace with the real base URL.
export const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:3001'  // Android emulator → host machine
  : 'https://api.transithub.cl';

export const API_PREFIX = '/api/v1';

export const endpoints = {
  auth: {
    login:    `${API_PREFIX}/auth/login`,
    register: `${API_PREFIX}/auth/register`,
    me:       `${API_PREFIX}/auth/me`,
  },
  buses: {
    list:     `${API_PREFIX}/buses`,
    detail:   (id: string) => `${API_PREFIX}/buses/${id}`,
    location: (id: string) => `${API_PREFIX}/buses/${id}/location`,
  },
  routes: {
    list:   `${API_PREFIX}/routes`,
    detail: (id: string) => `${API_PREFIX}/routes/${id}`,
    stops:  (id: string) => `${API_PREFIX}/routes/${id}/stops`,
    buses:  (id: string) => `${API_PREFIX}/routes/${id}/buses`,
  },
} as const;
