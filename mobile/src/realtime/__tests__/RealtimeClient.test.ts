import { RealtimeClient, reconnectDelay, type SocketLike } from '../RealtimeClient';
import type { ConnectionStatus, IncomingMessage } from '../types';
import { wsUrlFromApiUrl } from '../wsUrl';

/** WebSocket falso: el test decide cuándo abre, cierra o llega un mensaje. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  closedWith: [number?, string?] | null = null;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;

  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason];
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

let sockets: FakeSocket[];
const latest = () => sockets[sockets.length - 1];

function newClient() {
  sockets = [];
  const client = new RealtimeClient('ws://servidor/ws', (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  });
  const statuses: ConnectionStatus[] = [];
  client.onStatus((s) => statuses.push(s));
  return { client, statuses };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('wsUrlFromApiUrl', () => {
  it.each([
    ['http://192.168.1.6:3001/api/v1', 'ws://192.168.1.6:3001/ws'],
    ['http://localhost:3001/api/v1', 'ws://localhost:3001/ws'],
    ['https://api-backend-tpenroz.dev.censei.cl/api/v1', 'wss://api-backend-tpenroz.dev.censei.cl/ws'],
  ])('%s → %s', (api, ws) => {
    expect(wsUrlFromApiUrl(api)).toBe(ws);
  });
});

describe('RealtimeClient', () => {
  it('se conecta a la URL y avisa "connecting" y luego "connected"', () => {
    const { client, statuses } = newClient();
    client.connect();
    expect(latest().url).toBe('ws://servidor/ws');
    expect(client.status).toBe('connecting');

    latest().open();

    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('envía las suscripciones al abrir, como el web', () => {
    const { client } = newClient();
    client.subscribe('route', 'route-7A');
    client.connect();
    client.subscribe('route', 'route-7B');
    expect(latest().sent).toEqual([]);

    latest().open();

    expect(latest().sent).toEqual([
      { type: 'subscribe', topic: 'route', id: 'route-7A' },
      { type: 'subscribe', topic: 'route', id: 'route-7B' },
    ]);
  });

  it('separa varios mensajes de un envío por "\\n" e ignora los dañados', () => {
    const { client } = newClient();
    const received: IncomingMessage[] = [];
    client.onMessage((m) => received.push(m));
    client.connect();
    latest().open();

    latest().receive('{"type":"error","code":"A","message":"uno"}\nno es json\n\n{"type":"error","code":"B","message":"dos"}');

    expect(received.map((m) => (m.type === 'error' ? m.code : ''))).toEqual(['A', 'B']);
  });

  it('si se corta, reconecta con espera creciente (1 s, 2 s, 4 s…) y vuelve a suscribirse', () => {
    const { client, statuses } = newClient();
    client.subscribe('route', 'route-1C');
    client.connect();
    latest().open();

    latest().drop();
    expect(client.status).toBe('disconnected');
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    latest().drop(); // falla de nuevo antes de abrir
    jest.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    latest().open();
    expect(latest().sent).toEqual([{ type: 'subscribe', topic: 'route', id: 'route-1C' }]);
    expect(statuses.slice(-1)).toEqual(['connected']);
  });

  it('al conectar bien, la espera vuelve a empezar en 1 s', () => {
    const { client } = newClient();
    client.connect();
    latest().drop();
    jest.advanceTimersByTime(1000);
    latest().drop();
    jest.advanceTimersByTime(2000);
    latest().open();

    latest().drop();
    jest.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(4);
  });

  it('la espera llega como máximo a 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('un error cierra el socket y reconecta', () => {
    const { client } = newClient();
    client.connect();
    latest().onerror?.({});

    expect(client.status).toBe('disconnected');
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it('disconnect cierra a propósito: no reconecta y olvida las suscripciones', () => {
    const { client } = newClient();
    client.subscribe('route', 'route-7A');
    client.connect();
    latest().open();

    client.disconnect();
    jest.advanceTimersByTime(60000);

    expect(sockets).toHaveLength(1);
    expect(sockets[0].closedWith).toEqual([1000, 'Client disconnect']);
    expect(client.status).toBe('disconnected');
    client.connect();
    latest().open();
    expect(latest().sent).toEqual([]);
  });

  it('unsubscribe avisa al servidor y no se vuelve a suscribir al reconectar', () => {
    const { client } = newClient();
    client.subscribe('route', 'route-7A');
    client.connect();
    latest().open();
    client.unsubscribe('route', 'route-7A');
    expect(latest().sent.slice(-1)).toEqual([{ type: 'unsubscribe', topic: 'route', id: 'route-7A' }]);

    latest().drop();
    jest.advanceTimersByTime(1000);
    latest().open();

    expect(latest().sent).toEqual([]);
  });

  it('connect mientras ya está conectado no abre otra conexión', () => {
    const { client } = newClient();
    client.connect();
    client.connect();
    latest().open();
    client.connect();

    expect(sockets).toHaveLength(1);
  });
});

describe('publish (modo conductor)', () => {
  const message = {
    type: 'publish' as const,
    token: 'jwt',
    data: { busId: 'b1', routeId: 'r1', latitude: -38.7, longitude: -72.6, heading: 90, speed: 30, currentPassengers: 5, capacity: 40 },
  };

  it('envía la posición si hay conexión', () => {
    const { client } = newClient();
    client.connect();
    latest().open();

    expect(client.publish(message)).toBe(true);
    expect(latest().sent).toContainEqual(message);
  });

  it('sin conexión no la envía ni la guarda para después', () => {
    const { client } = newClient();
    expect(client.publish(message)).toBe(false);
    client.connect();
    expect(client.publish(message)).toBe(false); // todavía conectando
    latest().open();
    expect(latest().sent).not.toContainEqual(message);
  });
});
