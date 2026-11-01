// Corre en Node (jest.live.config.js): @types/node viene con Jest.
/// <reference types="node" />
import { createServer, type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';

// Verifica la configuración de jest.live.config.js con un servidor local, sin
// backend-go: si falla, las pruebas en vivo no podrían llegar al backend.

describe('configuración de las pruebas en vivo', () => {
  it('fetch hace solicitudes HTTP reales (no es el fetch de Expo)', async () => {
    let received: IncomingHttpHeaders | undefined;
    const server = createServer((req, res) => {
      received = req.headers;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/ping`, { headers: { 'X-Prueba': 'si' } });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(received?.['x-prueba']).toBe('si');
    } finally {
      server.close();
    }
  });

  it('el interceptor de la app envía el token guardado a ese servidor', async () => {
    let authorization: string | undefined;
    const server = createServer((req, res) => {
      authorization = req.headers.authorization;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const previousUrl = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${port}/api/v1`;
    try {
      // config.ts lee la URL al cargarse: se carga de nuevo después de fijarla.
      let modules!: { tokens: typeof import('../../storage/tokenStorage'); api: typeof import('../../api/interceptor') };
      jest.isolateModules(() => {
        modules = { tokens: require('../../storage/tokenStorage'), api: require('../../api/interceptor') };
      });
      await modules.tokens.saveTokens({ accessToken: 'token-de-prueba', refreshToken: 'refresh-de-prueba' });

      const response = await modules.api.authFetch('/auth/me');

      expect(response.status).toBe(200);
      expect(authorization).toBe('Bearer token-de-prueba');
    } finally {
      process.env.EXPO_PUBLIC_API_URL = previousUrl;
      server.close();
    }
  });
});
