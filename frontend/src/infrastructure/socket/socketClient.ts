import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Retorna la instancia singleton de Socket.io.
 * La crea si no existe.
 */
export const getSocket = (): Socket => {
  if (!socket) {
    socket = io('/', {
      autoConnect: false,
      withCredentials: true,
    });
  }
  return socket;
};

/**
 * Conecta el socket.
 */
export const connectSocket = (): void => {
  getSocket().connect();
};

/**
 * Desconecta el socket.
 */
export const disconnectSocket = (): void => {
  socket?.disconnect();
};

// ── Eventos exportados (igual que en el backend) ───────────
export const SocketEvents = {
  JOIN_ROUTE_ROOM: 'route:join',
  LEAVE_ROUTE_ROOM: 'route:leave',
  BUS_LOCATION_UPDATE: 'bus:location:update',
  BUS_LOCATION_BROADCAST: 'bus:location:broadcast',
  BUS_PASSENGERS_UPDATE: 'bus:passengers:update',
  BUS_STATUS_BROADCAST: 'bus:status:broadcast',
} as const;
