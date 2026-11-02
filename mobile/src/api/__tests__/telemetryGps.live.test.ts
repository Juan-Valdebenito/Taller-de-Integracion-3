import { createServer, type Server } from 'node:http';

import { login, logout } from '../../api/authApi';
import { RealtimeClient } from '../../realtime/RealtimeClient';
import type { IncomingMessage } from '../../realtime/types';
import { resolveWsUrl } from '../../realtime/wsUrl';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { apiRequest } from '../client';
import { fetchCompanyBuses } from '../companyApi';

// GPS del conductor por HTTP contra backend-go real: la posición llega al mapa
// en vivo y se reenvía a micro_telemetry (aquí, un servidor falso que pide la
// misma API key que el real).

interface Reading {
  event_id: string;
  bus_id: string;
  route_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  timestamp: string;
}

const readings: Reading[] = [];
const keys: string[] = [];
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      keys.push(String(req.headers['x-api-key'] ?? ''));
      if (req.headers['x-api-key'] !== process.env.LIVE_TELEMETRY_KEY) {
        res.writeHead(401).end('unauthorized');
        return;
      }
      readings.push(JSON.parse(raw) as Reading);
      res.writeHead(202, { 'Content-Type': 'application/json' }).end('{"status":"accepted"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(Number(process.env.LIVE_TELEMETRY_PORT ?? 3997), '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

beforeEach(() => {
  resetSecureStore();
});

const waitFor = <T>(fn: () => T | undefined, ms = 8_000) =>
  new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const value = fn();
      if (value !== undefined) return resolve(value);
      if (Date.now() - start > ms) return reject(new Error('tiempo agotado'));
      setTimeout(tick, 50);
    };
    tick();
  });

describeLive('GPS del conductor por HTTP en backend-go real', () => {
  it('la posición llega al mapa y a micro_telemetry con su API key', async () => {
    const listener = new RealtimeClient(resolveWsUrl());
    const updates: IncomingMessage[] = [];
    listener.onMessage((msg) => updates.push(msg));
    try {
      listener.connect();
      await waitFor(() => (listener.status === 'connected' ? true : undefined));
      listener.subscribe('route', SEED_ROUTE_ID);
      await new Promise((r) => setTimeout(r, 300));

      await login(SEED_COMPANY);
      const bus = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.companyId === SEED_COMPANY_ID)!;
      const timestamp = new Date().toISOString();
      await expect(
        apiRequest('/telemetry/gps', { method: 'POST', body: { busId: bus.id, routeId: SEED_ROUTE_ID, latitude: -38.7359, longitude: -72.5904, heading: 45, speed: 30, timestamp } }),
      ).resolves.toEqual({ live: true, telemetry: true });

      const update = await waitFor(() => updates.find((m): m is Extract<IncomingMessage, { type: 'bus:update' }> => m.type === 'bus:update' && m.data.busId === bus.id));
      expect(update.data).toMatchObject({ routeId: SEED_ROUTE_ID, latitude: -38.7359, longitude: -72.5904, heading: 45, speed: 30 });

      const reading = await waitFor(() => readings.find((r) => r.bus_id === bus.id && r.timestamp === timestamp));
      expect(reading).toMatchObject({ route_id: 'L1-DEMO', latitude: -38.7359, longitude: -72.5904, speed_kmh: 30 });
      expect(reading.event_id).toMatch(new RegExp(`^gps-${bus.id}-\\d+$`));
      expect(keys.every((k) => k === process.env.LIVE_TELEMETRY_KEY)).toBe(true);
    } finally {
      listener.disconnect();
      await logout();
    }
  });

  it('un pasajero no puede reportar GPS y una micro inexistente se rechaza', async () => {
    await login(SEED_PASSENGER);
    try {
      await expect(apiRequest('/telemetry/gps', { method: 'POST', body: { busId: 'x', routeId: SEED_ROUTE_ID, latitude: -38.7, longitude: -72.6 } })).rejects.toMatchObject({ status: 403 });
    } finally {
      await logout();
    }
    await login(SEED_COMPANY);
    try {
      await expect(apiRequest('/telemetry/gps', { method: 'POST', body: { busId: 'no-existe', routeId: SEED_ROUTE_ID, latitude: -38.7, longitude: -72.6 } })).rejects.toMatchObject({ status: 403 });
      await expect(apiRequest('/telemetry/gps', { method: 'POST', body: { busId: 'no-existe', routeId: SEED_ROUTE_ID } })).rejects.toMatchObject({ status: 400 });
    } finally {
      await logout();
    }
  });
});
