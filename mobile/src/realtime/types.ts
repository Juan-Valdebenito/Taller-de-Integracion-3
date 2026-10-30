/**
 * Mensajes del WebSocket de backend-go (internal/websocket), los mismos que usa
 * el frontend web (frontend/src/infrastructure/socket/socketClient.ts).
 */

export type Topic = 'route' | 'bus';

export interface SubscribeMessage {
  type: 'subscribe' | 'unsubscribe';
  topic: Topic;
  id: string;
}

/** Ocupación que calcula el backend (predictor), si viene en el mensaje. */
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
  /** Hora del servidor (ISO), para estimar la latencia. */
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

export type IncomingMessage = BusUpdateMessage | ErrorMessage;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
