import { API_URL } from '../config';

/**
 * URL del WebSocket de backend-go a partir de la URL de la API: mismo host y
 * puerto, ws:// o wss:// según http o https, y ruta /ws (como el web).
 *
 *   http://192.168.1.6:3001/api/v1                    → ws://192.168.1.6:3001/ws
 *   https://api-backend-tpenroz.dev.censei.cl/api/v1  → wss://api-backend-tpenroz.dev.censei.cl/ws
 *
 * EXPO_PUBLIC_WS_URL la reemplaza si el WebSocket está en otro lugar.
 */
export function wsUrlFromApiUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function resolveWsUrl(): string {
  const custom = process.env.EXPO_PUBLIC_WS_URL?.trim();
  return custom ? custom : wsUrlFromApiUrl(API_URL);
}
