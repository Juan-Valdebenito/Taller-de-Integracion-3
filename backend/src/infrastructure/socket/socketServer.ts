import { Server } from 'socket.io';

/**
 * Eventos de Socket.IO del sistema de transporte.
 */
export enum SocketEvents {
  // Emitidos por la micro (GPS tracker)
  BUS_LOCATION_UPDATE = 'bus:location:update',
  BUS_PASSENGERS_UPDATE = 'bus:passengers:update',

  // Emitidos al cliente (frontend)
  BUS_LOCATION_BROADCAST = 'bus:location:broadcast',
  BUS_STATUS_BROADCAST = 'bus:status:broadcast',

  // Salas (rooms)
  JOIN_ROUTE_ROOM = 'route:join',
  LEAVE_ROUTE_ROOM = 'route:leave',
}

/**
 * Configura todos los eventos de Socket.IO.
 */
export const setupSocketIO = (io: Server): void => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket conectado: ${socket.id}`);

    // ── Unirse a la sala de una ruta específica ─────────────
    socket.on(SocketEvents.JOIN_ROUTE_ROOM, (routeId: string) => {
      socket.join(`route:${routeId}`);
      console.log(`   → Socket ${socket.id} se unió a ruta:${routeId}`);
    });

    // ── Salir de la sala de una ruta ────────────────────────
    socket.on(SocketEvents.LEAVE_ROUTE_ROOM, (routeId: string) => {
      socket.leave(`route:${routeId}`);
    });

    // ── Actualización de ubicación de micro ─────────────────
    socket.on(
      SocketEvents.BUS_LOCATION_UPDATE,
      (data: {
        busId: string;
        routeId: string;
        latitude: number;
        longitude: number;
        heading?: number;
        speed?: number;
      }) => {
        // TODO: Persistir en BD vía use-case
        // Retransmitir a todos en la sala de la ruta
        io.to(`route:${data.routeId}`).emit(
          SocketEvents.BUS_LOCATION_BROADCAST,
          {
            ...data,
            timestamp: new Date().toISOString(),
          },
        );
      },
    );

    // ── Actualización de pasajeros ─────────────────────────
    socket.on(
      SocketEvents.BUS_PASSENGERS_UPDATE,
      (data: {
        busId: string;
        routeId: string;
        currentPassengers: number;
        boardings: number;
        alightings: number;
        schoolBoardings: number;
      }) => {
        // TODO: Persistir en BD vía use-case
        io.to(`route:${data.routeId}`).emit(
          SocketEvents.BUS_STATUS_BROADCAST,
          {
            ...data,
            timestamp: new Date().toISOString(),
          },
        );
      },
    );

    // ── Desconexión ─────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket desconectado: ${socket.id}`);
    });
  });
};
