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
    origin: (origin, callback) => {
      // Permitir cualquier origen local de Vite o sin origen (como Postman o apps móviles)
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
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

