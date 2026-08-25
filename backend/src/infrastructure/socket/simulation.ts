import { Server } from 'socket.io';

const TEMUCO_CENTER = { lat: -38.7359, lng: -72.5904 };

interface SimulatedBus {
  id: string;
  line: string;
  lat: number;
  lng: number;
  status: string;
  angle: number;
  radius: number;
  speed: number;
}

const buses: SimulatedBus[] = [
  { id: 'B-7A-01', line: '7A', lat: TEMUCO_CENTER.lat, lng: TEMUCO_CENTER.lng, status: 'En Ruta', angle: 0, radius: 0.01, speed: 0.1 },
  { id: 'B-1C-01', line: '1C', lat: TEMUCO_CENTER.lat, lng: TEMUCO_CENTER.lng, status: 'En Ruta', angle: Math.PI, radius: 0.015, speed: 0.08 },
  { id: 'B-7B-01', line: '7B', lat: TEMUCO_CENTER.lat, lng: TEMUCO_CENTER.lng, status: 'En Ruta', angle: Math.PI / 2, radius: 0.008, speed: 0.12 },
];

export function startSimulation(io: Server) {
  console.log('🚍 Iniciando simulación de micros...');
  
  setInterval(() => {
    buses.forEach(bus => {
      // Mover el bus en un círculo alrededor del centro para simular movimiento real
      bus.angle += bus.speed;
      bus.lat = TEMUCO_CENTER.lat + (Math.sin(bus.angle) * bus.radius);
      bus.lng = TEMUCO_CENTER.lng + (Math.cos(bus.angle) * bus.radius);
      
      // Emitir evento a todos los clientes conectados
      io.emit('bus:location:broadcast', {
        id: bus.id,
        line: bus.line,
        lat: bus.lat,
        lng: bus.lng,
        status: bus.status
      });
    });
  }, 2000); // Actualizar cada 2 segundos
}
