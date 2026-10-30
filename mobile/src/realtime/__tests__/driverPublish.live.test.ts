import { login, logout } from '../../api/authApi';
import { fetchCompanyBuses } from '../../api/companyApi';
import { buildPublishMessage } from '../../company/driverLocation';
import { getAccessToken } from '../../storage/tokenStorage';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { RealtimeClient } from '../RealtimeClient';
import type { IncomingMessage } from '../types';
import { resolveWsUrl } from '../wsUrl';

// Modo conductor contra backend-go real: la posición que publica la empresa
// por el WebSocket le llega a quien escucha esa ruta (el mapa del pasajero).

const waitFor = <T>(fn: () => T | undefined, ms = 10_000) =>
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

function connected(client: RealtimeClient) {
  client.connect();
  return waitFor(() => (client.status === 'connected' ? true : undefined));
}

beforeEach(() => {
  resetSecureStore();
});

describeLive('posición del conductor por el WebSocket en backend-go real', () => {
  it('lo que publica la empresa le llega al mapa que escucha esa ruta', async () => {
    const listener = new RealtimeClient(resolveWsUrl());
    const received: IncomingMessage[] = [];
    listener.onMessage((msg) => received.push(msg));
    const driver = new RealtimeClient(resolveWsUrl());
    try {
      await connected(listener);
      listener.subscribe('route', SEED_ROUTE_ID);

      await login(SEED_COMPANY);
      const bus = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.companyId === SEED_COMPANY_ID)!;
      const token = (await getAccessToken())!;
      await connected(driver);
      // Pequeña espera para que la suscripción quede registrada en el servidor.
      await new Promise((r) => setTimeout(r, 300));

      const position = { latitude: -38.7359, longitude: -72.5904 };
      expect(driver.publish(buildPublishMessage(token, bus, SEED_ROUTE_ID, position, { heading: 90, speed: 25 }))).toBe(true);

      const update = await waitFor(() =>
        received.find((m): m is Extract<IncomingMessage, { type: 'bus:update' }> => m.type === 'bus:update' && m.data.busId === bus.id),
      );
      expect(update.data).toMatchObject({ routeId: SEED_ROUTE_ID, latitude: position.latitude, longitude: position.longitude, heading: 90, speed: 25 });
    } finally {
      listener.disconnect();
      driver.disconnect();
      await logout();
    }
  });

  it('un pasajero no puede publicar posiciones', async () => {
    const client = new RealtimeClient(resolveWsUrl());
    const received: IncomingMessage[] = [];
    client.onMessage((msg) => received.push(msg));
    await login(SEED_PASSENGER);
    try {
      await connected(client);
      const token = (await getAccessToken())!;
      client.publish(
        buildPublishMessage(token, { id: 'bus-demo', currentPassengers: 0, capacity: 40 }, SEED_ROUTE_ID, { latitude: -38.7, longitude: -72.6 }, { heading: 0, speed: 0 }),
      );

      const error = await waitFor(() => received.find((m): m is Extract<IncomingMessage, { type: 'error' }> => m.type === 'error'));
      expect(error).toMatchObject({ code: 'AUTH_REQUIRED' });
    } finally {
      client.disconnect();
      await logout();
    }
  });
});
