import type { AuthContextValue } from '../auth/AuthContext';

/** Valor de useAuth() para tests de pantallas, con todas las acciones mockeadas. */
export function mockAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'signedOut',
    user: null,
    restoreError: null,
    signOutNotice: null,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    retryRestore: jest.fn(),
    refreshUser: jest.fn(),
    ...overrides,
  };
}
