/**
 * Utilidades de test: respuestas HTTP falsas para simular a backend-go con un
 * fetch mockeado, sin depender del Response global del entorno de Jest.
 */
export interface FakeResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export function fakeResponse({ status = 200, body, headers = {} }: FakeResponseInit = {}): Response {
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowerHeaders[name.toLowerCase()] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

export type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

export function installFetchMock(): FetchMock {
  const mock = jest.fn() as FetchMock;
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Devuelve el header Authorization enviado en la llamada n de fetch. */
export function authHeaderOf(mock: FetchMock, call: number): string | undefined {
  const init = mock.mock.calls[call]?.[1];
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/** Devuelve el body JSON enviado en la llamada n de fetch. */
export function bodyOf(mock: FetchMock, call: number): any {
  const raw = mock.mock.calls[call]?.[1]?.body;
  return typeof raw === 'string' ? JSON.parse(raw) : undefined;
}
