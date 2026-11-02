import type {
  BusUpdateMessage,
  ErrorMessage,
  SubscribeMessage,
  PublishMessage,
} from './socketClient';

export type MobileSocketStatus =
  | 'offline'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type MobileSocketMessage = BusUpdateMessage | ErrorMessage;

export interface MobileWebSocketOptions {
  url: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  reconnectMultiplier?: number;
  WebSocketImpl?: typeof WebSocket;
}

export interface MobileSocketState {
  status: MobileSocketStatus;
  reconnectAttempts: number;
  lastError: Error | null;
}

type SocketMessage = SubscribeMessage | PublishMessage;
type MessageHandler = (message: MobileSocketMessage) => void;
type StateHandler = (state: MobileSocketState) => void;
type WebSocketLike = WebSocket;

/**
 * WebSocket client for React Native.
 *
 * It deliberately does not import NetInfo so the transport remains usable with
 * Expo, bare React Native, or another connectivity library. The app should
 * call setOnline() from its network listener.
 */
export class MobileWebSocketClient {
  private readonly options: Required<
    Pick<MobileWebSocketOptions, 'reconnectBaseMs' | 'reconnectMaxMs' | 'reconnectMultiplier'>
  > &
    MobileWebSocketOptions;
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private online = true;
  private subscriptions: SubscribeMessage[] = [];
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly stateHandlers = new Set<StateHandler>();
  private state: MobileSocketState = {
    status: 'idle',
    reconnectAttempts: 0,
    lastError: null,
  };

  constructor(options: MobileWebSocketOptions) {
    this.options = {
      ...options,
      reconnectBaseMs: options.reconnectBaseMs ?? 1000,
      reconnectMaxMs: options.reconnectMaxMs ?? 30000,
      reconnectMultiplier: options.reconnectMultiplier ?? 2,
    };
  }

  connect(): void {
    if (!this.online || this.intentionalClose) return;

    const WebSocketImpl = this.options.WebSocketImpl ?? WebSocket;
    if (
      this.socket &&
      (this.socket.readyState === WebSocketImpl.OPEN ||
        this.socket.readyState === WebSocketImpl.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.updateState({
      status: this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      lastError: null,
    });

    try {
      const socket = new WebSocketImpl(this.options.url);
      this.socket = socket;

      socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateState({ status: 'connected', reconnectAttempts: 0 });
        this.subscriptions.forEach((subscription) => this.send(subscription));
      };

      socket.onmessage = (event: MessageEvent) => {
        this.handleIncoming(event.data);
      };

      socket.onerror = () => {
        this.updateState({ lastError: new Error('WebSocket connection failed') });
        socket.close();
      };

      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        if (!this.intentionalClose && this.online) {
          this.scheduleReconnect();
        } else if (!this.online) {
          this.updateState({ status: 'offline' });
        } else {
          this.updateState({ status: 'idle' });
        }
      };
    } catch (error) {
      this.updateState({
        lastError: error instanceof Error ? error : new Error(String(error)),
      });
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.socket?.close(1000, 'Client disconnect');
    this.socket = null;
    this.reconnectAttempts = 0;
    this.updateState({ status: 'idle', reconnectAttempts: 0 });
  }

  setOnline(isOnline: boolean): void {
    this.online = isOnline;

    if (!isOnline) {
      this.clearReconnectTimer();
      this.socket?.close(1000, 'Device offline');
      this.socket = null;
      this.updateState({ status: 'offline' });
      return;
    }

    if (this.state.status === 'offline') {
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  send(message: SocketMessage): boolean {
    const WebSocketImpl = this.options.WebSocketImpl ?? WebSocket;
    if (!this.socket || this.socket.readyState !== WebSocketImpl.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  subscribe(topic: 'route' | 'bus', id: string): void {
    const subscription: SubscribeMessage = { type: 'subscribe', topic, id };
    if (!this.subscriptions.some((item) => item.topic === topic && item.id === id)) {
      this.subscriptions.push(subscription);
    }
    this.send(subscription);
  }

  unsubscribe(topic: 'route' | 'bus', id: string): void {
    this.subscriptions = this.subscriptions.filter(
      (item) => item.topic !== topic || item.id !== id,
    );
    this.send({ type: 'unsubscribe', topic, id });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  getState(): MobileSocketState {
    return this.state;
  }

  private handleIncoming(rawData: unknown): void {
    if (typeof rawData !== 'string') return;

    for (const rawMessage of rawData.split('\n')) {
      if (!rawMessage.trim()) continue;
      try {
        const message = JSON.parse(rawMessage) as MobileSocketMessage;
        this.messageHandlers.forEach((handler) => handler(message));
      } catch (error) {
        this.updateState({
          lastError: new Error(
            `Invalid WebSocket message: ${error instanceof Error ? error.message : String(error)}`,
          ),
        });
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.online || this.reconnectTimer) return;

    const delay = Math.min(
      this.options.reconnectBaseMs *
        Math.pow(this.options.reconnectMultiplier, this.reconnectAttempts),
      this.options.reconnectMaxMs,
    );
    this.reconnectAttempts += 1;
    this.updateState({
      status: 'reconnecting',
      reconnectAttempts: this.reconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private updateState(patch: Partial<MobileSocketState>): void {
    this.state = { ...this.state, ...patch };
    this.stateHandlers.forEach((handler) => handler(this.state));
  }
}
