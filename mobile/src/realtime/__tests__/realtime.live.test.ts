import { describeLive } from '../../test-utils/live/backend';
import { RealtimeClient } from '../RealtimeClient';
import type { BusUpdatePayload, ConnectionStatus } from '../types';
import { resolveWsUrl } from '../wsUrl';

// WebSocket de backend-go real (levantado por scripts/live-backend.mjs con la
// simulación de micros encendida): mismo protocolo que el frontend web.

describeLive('WebSocket de backend-go real', () => {
  it('se conecta a /ws, se suscribe a una línea y recibe sus micros (bus:update)', async () => {
    const client = new RealtimeClient(resolveWsUrl());
    const statuses: ConnectionStatus[] = [];
    client.onStatus((s) => statuses.push(s));
    const firstUpdate = new Promise<BusUpdatePayload>((resolve) => {
      client.onMessage((msg) => {
        if (msg.type === 'bus:update') resolve(msg.data);
      });
    });
    try {
      client.connect();
      client.subscribe('route', 'route-7A');

      const data = await firstUpdate;

      expect(statuses).toContain('connected');
      expect(data.routeId).toBe('route-7A');
      expect(typeof data.busId).toBe('string');
      expect(Number.isFinite(data.latitude) && Number.isFinite(data.longitude)).toBe(true);
      expect(Number.isFinite(Date.parse(data.timestamp))).toBe(true);
    } finally {
      client.disconnect();
    }
  }, 30_000);
});
