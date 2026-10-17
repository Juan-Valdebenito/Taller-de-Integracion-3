/**
 * Estado de sesión de la app.
 *
 * - Al montar, recupera la sesión guardada en SecureStore (restoreSession).
 * - signIn / signUp guardan los tokens cifrados y dejan al usuario dentro.
 * - signOut revoca los tokens en el servidor y los borra del dispositivo.
 * - Si la API no puede renovar los tokens (sesión expirada), vuelve a "signedOut".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as authApi from '../api/authApi';
import { ApiError, setSessionExpiredHandler } from '../api/client';
import type { AuthUser, LoginInput, RegisterInput } from './types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Error al recuperar la sesión al abrir la app (ej. sin conexión). */
  restoreError: string | null;
  /**
   * Aviso tras cerrar sesión si el servidor no confirmó que los tokens quedaron
   * en la lista negra (se muestra en el login). Se limpia al volver a entrar.
   */
  signOutNotice: string | null;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  /** Envía los tokens a la lista negra del backend y cierra la sesión local. */
  signOut: () => Promise<void>;
  retryRestore: () => Promise<void>;
  /** Vuelve a pedir los datos del usuario al servidor (GET /auth/me). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);

  const restore = useCallback(async () => {
    setStatus('loading');
    setRestoreError(null);
    try {
      const restored = await authApi.restoreSession();
      setUser(restored);
      setStatus(restored ? 'signedIn' : 'signedOut');
    } catch (error) {
      // Sin conexión: los tokens se conservan y se puede reintentar.
      setUser(null);
      setStatus('signedOut');
      setRestoreError(error instanceof ApiError ? error.message : 'No se pudo recuperar la sesión.');
    }
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('signedOut');
    });
    restore();
    return () => setSessionExpiredHandler(null);
  }, [restore]);

  const signIn = useCallback(async (input: LoginInput) => {
    const signedInUser = await authApi.login(input);
    setRestoreError(null);
    setSignOutNotice(null);
    setUser(signedInUser);
    setStatus('signedIn');
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    const newUser = await authApi.register(input);
    setRestoreError(null);
    setSignOutNotice(null);
    setUser(newUser);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    const { serverConfirmed } = await authApi.logout();
    setRestoreError(null);
    setSignOutNotice(
      serverConfirmed
        ? null
        : 'Cerraste sesión en este dispositivo, pero no se pudo confirmar con el servidor (¿sin conexión?). ' +
            'Tu sesión anterior dejará de ser válida cuando expire.',
    );
    setUser(null);
    setStatus('signedOut');
  }, []);

  const refreshUser = useCallback(async () => {
    // Si la sesión ya no es válida, el cliente avisa con onSessionExpired.
    const current = await authApi.getCurrentUser();
    setUser(current);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, restoreError, signOutNotice, signIn, signUp, signOut, retryRestore: restore, refreshUser }),
    [status, user, restoreError, signOutNotice, signIn, signUp, signOut, restore, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return context;
}
