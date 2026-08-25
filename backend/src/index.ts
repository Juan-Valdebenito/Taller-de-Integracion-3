import 'dotenv/config';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './infrastructure/http/app';
import { setupSocketIO } from './infrastructure/socket/socketServer';
import { startSimulation } from './infrastructure/socket/simulation';

const PORT = process.env.PORT ?? 3001;

const httpServer = createServer(app);

// ── Socket.IO ──────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

setupSocketIO(io);
startSimulation(io);

// ── Iniciar servidor ───────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚌  Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔌  Socket.IO activo`);
  console.log(`🌍  Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
});

export { io };

