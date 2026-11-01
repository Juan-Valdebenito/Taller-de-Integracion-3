import { login, logout } from '../../api/authApi';
import { createCompany, createRoute } from '../../api/adminApi';
import { createCompanyBus, fetchCompanyBuses, type CompanyBus } from '../../api/companyApi';
import { formatRut, NEW_COMPANY_FORM, rutCheckDigit, toCompanyInput } from '../../admin/companyForm';
import { buildPublishMessage } from '../../company/driverLocation';
import { getAccessToken } from '../../storage/tokenStorage';
import { describeLive, resetSecureStore, SEED_ADMIN, SEED_COMPANY, SEED_COMPANY_ID, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { RealtimeClient } from '../RealtimeClient';
import type { IncomingMessage } from '../types';
import { resolveWsUrl } from '../wsUrl';

// Modo conductor contra backend-go real: la posición que publica la empresa
// por el WebSocket le llega a quien escucha esa ruta (el mapa del pasajero),
// y solo puede publicar sus micros con un token vigente.

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

  it('una empresa no puede publicar micros de otra empresa ni usar rutas ajenas', async () => {
    const suffix = Date.now();
    // Otra empresa con su ruta y su micro.
    await login(SEED_ADMIN);
    let otherRouteId: string;
    let otherBus: CompanyBus;
    try {
      const body = String(73_000_000 + (suffix % 1_000_000) * 10);
      const company = await createCompany(
        toCompanyInput({ ...NEW_COMPANY_FORM, name: `Mapa Ajeno ${suffix}`, rut: formatRut(body + rutCheckDigit(body))!.replace(/\./g, ''), email: `mapa-${suffix}@buses.cl` }),
      );
      otherRouteId = (await createRoute({ code: `M${suffix % 100000}`, name: 'Ruta del mapa ajeno', description: null, companyId: company.id })).id;
      const letters = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(suffix / 26 ** i) % 26))).join('');
      otherBus = await createCompanyBus({ patente: `${letters}-${String(suffix % 100).padStart(2, '0')}`, capacity: 30, routeId: otherRouteId, companyId: company.id });
    } finally {
      await logout();
    }

    const client = new RealtimeClient(resolveWsUrl());
    const errors: Extract<IncomingMessage, { type: 'error' }>[] = [];
    client.onMessage((msg) => {
      if (msg.type === 'error') errors.push(msg);
    });
    await login(SEED_COMPANY);
    try {
      const ownBus = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.companyId === SEED_COMPANY_ID)!;
      const token = (await getAccessToken())!;
      await connected(client);
      const position = { latitude: -38.7, longitude: -72.6 };

      client.publish(buildPublishMessage(token, otherBus, otherRouteId, position, { heading: 0, speed: 0 }));
      expect(await waitFor(() => errors[0])).toMatchObject({ code: 'FORBIDDEN', message: 'La micro no existe o no pertenece a tu empresa' });

      client.publish(buildPublishMessage(token, ownBus, otherRouteId, position, { heading: 0, speed: 0 }));
      expect(await waitFor(() => errors[1])).toMatchObject({ code: 'FORBIDDEN', message: 'La ruta no existe o no pertenece a tu empresa' });
    } finally {
      client.disconnect();
      await logout();
    }
  });

  it('después de cerrar sesión, el token anterior ya no sirve para publicar', async () => {
    const client = new RealtimeClient(resolveWsUrl());
    const received: IncomingMessage[] = [];
    client.onMessage((msg) => received.push(msg));
    await login(SEED_COMPANY);
    const bus = (await fetchCompanyBuses(SEED_COMPANY_ID)).find((b) => b.companyId === SEED_COMPANY_ID)!;
    const token = (await getAccessToken())!;
    // Al cerrar sesión, backend-go revoca el access token.
    await logout();
    try {
      await connected(client);
      client.publish(buildPublishMessage(token, bus, SEED_ROUTE_ID, { latitude: -38.7, longitude: -72.6 }, { heading: 0, speed: 0 }));

      const error = await waitFor(() => received.find((m): m is Extract<IncomingMessage, { type: 'error' }> => m.type === 'error'));
      expect(error).toMatchObject({ code: 'AUTH_REQUIRED', message: 'El token ha sido revocado. Por favor inicia sesión nuevamente' });
    } finally {
      client.disconnect();
    }
  });
});
