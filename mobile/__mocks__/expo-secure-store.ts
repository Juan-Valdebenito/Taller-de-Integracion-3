/**
 * Mock en memoria de expo-secure-store para Jest (en los tests no hay Keychain
 * ni Android Keystore). Jest lo usa automáticamente en lugar del módulo real.
 */
const store = new Map<string, string>();

export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';

export const setItemAsync = jest.fn(async (key: string, value: string) => {
  store.set(key, value);
});
export const getItemAsync = jest.fn(async (key: string) => store.get(key) ?? null);
export const deleteItemAsync = jest.fn(async (key: string) => {
  store.delete(key);
});
export const isAvailableAsync = jest.fn(async () => true);

/** Helpers solo para tests. */
export function __reset(): void {
  store.clear();
  setItemAsync.mockClear();
  getItemAsync.mockClear();
  deleteItemAsync.mockClear();
}
export function __dump(): Record<string, string> {
  return Object.fromEntries(store);
}
