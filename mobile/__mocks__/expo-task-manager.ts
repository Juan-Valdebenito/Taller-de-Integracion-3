/**
 * Mock de expo-task-manager para Jest (en los tests no hay tareas en segundo
 * plano). defineTask guarda el ejecutor para que un test pueda llamarlo.
 */
type Executor = (body: { data: unknown; error: { code: string; message: string } | null; executionInfo: { eventId: string; taskName: string } }) => Promise<void> | void;

export const __tasks = new Map<string, Executor>();

export const defineTask = jest.fn((name: string, executor: Executor) => {
  __tasks.set(name, executor);
});
export const isAvailableAsync = jest.fn(async () => true);
export const isTaskRegisteredAsync = jest.fn(async () => false);
export const unregisterTaskAsync = jest.fn(async () => undefined);
