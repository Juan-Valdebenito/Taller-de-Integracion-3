/**
 * socketClient.ts
 *
 * Cliente WebSocket nativo para conectarse al servidor Go (gorilla/websocket).
 * Implementa reconexión automática con backoff exponencial.
 *
 * Reemplaza la implementación anterior basada en Socket.IO.
 */

// ── Tipos de mensajes ─────────────────────────────────────────────────────

export interface SubscribeMessage {
  type: 'subscribe' | 'unsubscribe';
  topic: 'route' | 'bus';
  id: string;
}

export interface PublishMessage {
  type: 'publish';
  token: string;
  data: {
    busId: string;
    routeId: string;
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    currentPassengers: number;
    capacity: number;
  };
}

export interface OccupancyInfo {
  currentRatio: number;
  predictedRatio: number;
  occupancyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL';
  occupancyText: string;
  occupancyColor: string;
  confidence: number;
  isSimulated: boolean;
  predictorName: string;
}

export interface BusUpdatePayload {
  busId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  currentPassengers: number;
  capacity: number;
  boardings?: number;
  alightings?: number;
  studentBoardings?: number;
  rejectedBoardings?: number;
  totalBoardings?: number;
  totalAlightings?: number;
  totalStudents?: number;
  occupancy?: OccupancyInfo;
  timestamp: string;
}

export interface BusUpdateMessage {
  type: 'bus:update';
  data: BusUpdatePayload;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

type IncomingMessage = BusUpdateMessage | ErrorMessage;

// ── Eventos exportados (compatibilidad con nombres anteriores) ─────────────

export const SocketEvents = {
  BUS_UPDATE: 'bus:update',
} as const;

// ── Configuración de reconexión ───────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;   // 1 segundo inicial
const RECONNECT_MAX_MS = 30000;   // 30 segundos máximo
const RECONNECT_MULTIPLIER = 2;   // backoff exponencial ×2

// ── Estado interno ─────────────────────────────────────────────────────────

type MessageHandler = (msg: IncomingMessage) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isIntentionalClose = false;
let messageHandlers: MessageHandler[] = [];
let pendingSubscriptions: SubscribeMessage[] = [];

// ── Funciones públicas ─────────────────────────────────────────────────────

/**
 * Construye la URL del WebSocket basándose en el host actual.
 */
function getWSUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Configurable via VITE_WS_URL en .env del frontend
  const customUrl = import.meta.env.VITE_WS_URL;
  if (customUrl) {
    const url = new URL(customUrl, window.location.origin);
    if (window.location.protocol === 'https:' && url.protocol === 'ws:') {
      url.protocol = 'wss:';
    }
    if (!url.pathname.endsWith('/ws')) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
    }
    return url.toString();
  }
  return `${protocol}//${window.location.hostname}:3001/ws`;
}

/**
 * Conecta al servidor WebSocket. Si ya hay una conexión activa, no hace nada.
 */
export function connectWS(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isIntentionalClose = false;

  try {
    const url = getWSUrl();
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[WS] Conectado al servidor —', url);
      reconnectAttempts = 0;

      // Re-enviar suscripciones pendientes
      for (const sub of pendingSubscriptions) {
        sendMessage(sub);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        // Soportar batch messages (separados por \n)
        const messages = (event.data as string).split('\n');
        for (const raw of messages) {
          if (!raw.trim()) continue;
          const msg: IncomingMessage = JSON.parse(raw);
          for (const handler of messageHandlers) {
            handler(msg);
          }
        }
      } catch (err) {
        console.warn('[WS] Error al parsear mensaje:', err);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      console.log('[WS] Desconectado —', event.code, event.reason);
      ws = null;

      if (!isIntentionalClose) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose se dispara después de onerror, ahí se maneja la reconexión
      ws?.close();
    };
  } catch {
    // Falló la creación del WebSocket — programar reconexión
    scheduleReconnect();
  }
}

/**
 * Desconecta el WebSocket intencionalmente (sin reconexión).
 */
export function disconnectWS(): void {
  isIntentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  pendingSubscriptions = [];
  ws?.close(1000, 'Client disconnect');
  ws = null;
}

/**
 * Envía un mensaje JSON al servidor WebSocket.
 */
export function sendMessage(msg: SubscribeMessage | PublishMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Suscribirse a un topic. La suscripción se persiste para reconexiones.
 */
export function subscribe(topic: 'route' | 'bus', id: string): void {
  const msg: SubscribeMessage = { type: 'subscribe', topic, id };

  // Guardar para re-enviar en reconexión
  if (!pendingSubscriptions.some((s) => s.topic === topic && s.id === id)) {
    pendingSubscriptions.push(msg);
  }

  sendMessage(msg);
}

/**
 * Desuscribirse de un topic.
 */
export function unsubscribe(topic: 'route' | 'bus', id: string): void {
  const msg: SubscribeMessage = { type: 'unsubscribe', topic, id };

  // Remover de suscripciones persistidas
  pendingSubscriptions = pendingSubscriptions.filter(
    (s) => !(s.topic === topic && s.id === id),
  );

  sendMessage(msg);
}

/**
 * Registra un handler para mensajes entrantes. Retorna una función para
 * desregistrarlo.
 */
export function onMessage(handler: MessageHandler): () => void {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter((h) => h !== handler);
  };
}

/**
 * Retorna true si el WebSocket está conectado.
 */
export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

// ── Reconexión con backoff exponencial ────────────────────────────────────

function scheduleReconnect(): void {
  if (isIntentionalClose) return;

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, reconnectAttempts),
    RECONNECT_MAX_MS,
  );

  console.log(`[WS] Reconectando en ${delay}ms (intento ${reconnectAttempts + 1})...`);

  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    connectWS();
  }, delay);
}
