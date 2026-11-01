import { createServer, type Server } from 'node:http';

import { login, logout } from '../../api/authApi';
import { describeLive, resetSecureStore, SEED_COMPANY, SEED_PASSENGER, SEED_ROUTE_ID } from '../../test-utils/live/backend';
import { createComplaint, updateComplaintStatus } from '../complaintsApi';
import { registerPushToken } from '../pushApi';

// Avisos push al pasajero contra backend-go real: cuando la empresa responde su
// reclamo, el backend envía la notificación a Expo Push (aquí, un servidor
// falso que imita sus respuestas).

interface PushMessage {
  to: string;
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
}

const received: PushMessage[] = [];
/** Tokens a los que el servidor falso responde DeviceNotRegistered. */
const unregistered = new Set<string>();
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const messages = JSON.parse(raw) as PushMessage[];
      received.push(...messages);
      const data = messages.map((m) =>
        unregistered.has(m.to) ? { status: 'error', message: 'no registrado', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `ticket-${received.length}` },
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((resolve) => server.listen(Number(process.env.LIVE_PUSH_PORT ?? 3996), '127.0.0.1', resolve));
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
      if (Date.now() - start > ms) return reject(new Error('tiempo agotado esperando la notificación'));
      setTimeout(tick, 50);
    };
    tick();
  });

describeLive('avisos push de reclamos en backend-go real', () => {
  it('cuando la empresa responde, le llega el aviso al teléfono del pasajero; un teléfono dado de baja se olvida', async () => {
    const suffix = Date.now();
    const phone = `ExponentPushToken[pasajero${suffix}]`;
    const oldPhone = `ExponentPushToken[viejo${suffix}]`;
    unregistered.add(oldPhone);

    await login(SEED_PASSENGER);
    let first: string;
    let second: string;
    try {
      await registerPushToken(phone, 'android');
      await registerPushToken(oldPhone, 'ios');
      const complaint = (title: string) => createComplaint({ title, description: `${title}: la micro no se detuvo`, category: 'DELAY', lineName: '7A', rating: 2, routeId: SEED_ROUTE_ID });
      first = (await complaint(`Push uno ${suffix}`)).id;
      second = (await complaint(`Push dos ${suffix}`)).id;
    } finally {
      await logout();
    }

    await login(SEED_COMPANY);
    try {
      await updateComplaintStatus(first, { status: 'RESOLVED', adminResponse: 'Reforzamos la frecuencia en hora punta' });
      const toPhone = await waitFor(() => received.find((m) => m.to === phone && m.data?.complaintId === first));
      expect(toPhone).toMatchObject({
        title: 'Tu reclamo fue resuelto',
        body: 'Reforzamos la frecuencia en hora punta',
        channelId: 'complaint-updates',
        data: { type: 'complaint-status', complaintId: first, status: 'RESOLVED' },
      });
      // También se intentó con el teléfono viejo, y Expo dijo que ya no existe.
      await waitFor(() => received.find((m) => m.to === oldPhone && m.data?.complaintId === first));

      // El siguiente aviso ya no va al teléfono viejo: el backend lo olvidó.
      await updateComplaintStatus(second, { status: 'IN_REVIEW', adminResponse: 'Lo estamos revisando' });
      await waitFor(() => received.find((m) => m.to === phone && m.data?.complaintId === second));
      expect(received.some((m) => m.to === oldPhone && m.data?.complaintId === second)).toBe(false);
    } finally {
      await logout();
    }
  });
});
