// Precarga para `npm run dev:realtime`: en local backend-go ya ocupa :3001, así
// que el servidor Socket.io se levanta en :3002 (adonde apunta el proxy de Vite).
// Se fija antes de que dotenv lea backend/.env, y dotenv no pisa variables ya definidas.
process.env.PORT = process.env.REALTIME_PORT || '3002';
