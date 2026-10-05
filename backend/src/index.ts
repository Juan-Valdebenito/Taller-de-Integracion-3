import 'dotenv/config';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './infrastructure/http/app';
import { setupSocketIO } from './infrastructure/socket/socketServer';
import { startSimulation } from './infrastructure/socket/simulation';

const PORT = process.env.PORT ?? 3001;

const httpServer = createServer(app);

// Orígenes permitidos para Socket.IO, separados por coma
// (ej. "https://transithub.midominio.cl,http://localhost:5173").
// Sin definir se acepta cualquiera, como antes, para no romper el desarrollo local.
// Detrás del Ingress el frontend es del mismo origen, así que basta con su URL pública.
const allowedOrigins = (process.env.SOCKET_CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// ── Socket.IO ──────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
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
  console.log(`🌍  Entorno: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`🔐  Orígenes Socket.IO: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'cualquiera'}\n`);
});

// ── Cierre ordenado ────────────────────────────────────────
// Kubernetes envía SIGTERM al reiniciar/actualizar el pod. io.close() cierra
// los transportes (los clientes ven "transport close" y se reconectan solos al
// nuevo pod a través del Ingress) y luego el servidor HTTP.
let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑  ${signal} recibido: cerrando ${io.engine.clientsCount} conexión(es)...`);
  io.close(() => process.exit(0));
  // Si algo queda colgado, salir antes de que Kubernetes mate el proceso (30 s)
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { io };

