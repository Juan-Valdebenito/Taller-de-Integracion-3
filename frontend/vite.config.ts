import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// En local, la API la sirve backend-go (:3001) y el tiempo real (Socket.io) el
// backend Node (`npm run dev:realtime`, :3002). En el cluster lo mismo lo hace
// el Ingress (kubernetes/ingress/), por eso el frontend usa siempre rutas relativas.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';
const REALTIME_TARGET = process.env.REALTIME_PROXY_TARGET ?? 'http://localhost:3002';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@routes': resolve(__dirname, 'src/routes'),
      '@assets': resolve(__dirname, 'src/assets'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/socket.io': {
        target: REALTIME_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
