/**
 * Cliente del WebSocket de backend-go (gorilla/websocket), con el mismo
 * protocolo y reconexión que el frontend web:
 *
 * - Suscripciones { type: 'subscribe', topic: 'route', id: 'route-7A' } que se
 *   guardan y se vuelven a enviar al reconectar.
 * - Mensajes JSON, a veces varios en un envío separados por "\n".
 * - Reconexión con espera creciente: 1 s, 2 s, 4 s… hasta 30 s. Al cerrar a
 *   propósito (disconnect) no reconecta.
 *
 * A diferencia del web, es una clase (sin estado global) que recibe el
 * constructor de WebSocket, y avisa cada cambio de estado al instante.
 */
import type { ConnectionStatus, IncomingMessage, SubscribeMessage, Topic } from './types';

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30000;
const RECONNECT_MULTIPLIER = 2;

/** Lo mínimo de WebSocket que usa el cliente (permite uno falso en tests). */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

/** Espera antes del intento de reconexión número `attempt` (desde 0). */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * RECONNECT_MULTIPLIER ** attempt, RECONNECT_MAX_MS);
}

export class RealtimeClient {
  private socket: SocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private intentionalClose = false;
  private subscriptions: SubscribeMessage[] = [];
  private messageHandlers = new Set<(msg: IncomingMessage) => void>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private currentStatus: ConnectionStatus = 'disconnected';

  constructor(
    private readonly url: string,
    private readonly createSocket: SocketFactory = (target) => new WebSocket(target) as unknown as SocketLike,
  ) {}

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  /** Conecta; si ya está conectado o conectando, no hace nada. */
  connect(): void {
    if (this.socket) return;
    this.intentionalClose = false;
    this.clearReconnect();
    this.setStatus('connecting');

    let socket: SocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setStatus('connected');
      for (const sub of this.subscriptions) this.send(sub);
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      for (const raw of event.data.split('\n')) {
        if (!raw.trim()) continue;
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(raw) as IncomingMessage;
        } catch {
          continue; // Un mensaje dañado no corta los demás.
        }
        for (const handler of this.messageHandlers) handler(msg);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setStatus('disconnected');
      if (!this.intentionalClose) this.scheduleReconnect();
    };
    // Después de onerror llega onclose, que reconecta.
    socket.onerror = () => socket.close();
  }

  /** Cierra a propósito: no reconecta y olvida las suscripciones. */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    this.attempts = 0;
    this.subscriptions = [];
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'Client disconnect');
    this.setStatus('disconnected');
  }

  /** Suscribe a un tema; se vuelve a enviar al reconectar. */
  subscribe(topic: Topic, id: string): void {
    const msg: SubscribeMessage = { type: 'subscribe', topic, id };
    if (!this.subscriptions.some((s) => s.topic === topic && s.id === id)) {
      this.subscriptions.push(msg);
    }
    this.send(msg);
  }

  unsubscribe(topic: Topic, id: string): void {
    this.subscriptions = this.subscriptions.filter((s) => !(s.topic === topic && s.id === id));
    this.send({ type: 'unsubscribe', topic, id });
  }

  /** Recibe los mensajes del servidor; devuelve la función para dejar de recibirlos. */
  onMessage(handler: (msg: IncomingMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Avisa cada cambio de estado de la conexión. */
  onStatus(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private send(msg: SubscribeMessage): void {
    if (this.socket && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    this.setStatus('disconnected');
    const delay = reconnectDelay(this.attempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attempts += 1;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
