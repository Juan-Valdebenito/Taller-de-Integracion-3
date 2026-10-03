import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { apiClient } from '../../infrastructure/api/apiClient';

// ── Tipos ─────────────────────────────────────────────────────

export type UserRole = 'PASSENGER' | 'COMPANY' | 'ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
}

// ── Contexto ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('token'),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('user');
    if (stored && stored !== 'undefined') {
      try {
        return JSON.parse(stored) as AuthUser;
      } catch (error) {
        console.error('Error parsing user from localStorage:', error);
        localStorage.removeItem('user');
        return null;
      }
    }
    return null;
  });
  const [isLoading] = useState(false);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    console.log('Logging in user:', newUser);
    console.log('Storing token in localStorage:', newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revoca el token en el servidor (blacklist por jti) para que no
      // pueda seguir usándose aunque alguien lo haya interceptado.
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Error al revocar el token en el servidor:', error);
    } finally {
      // Se limpia localmente aunque falle la llamada al servidor
      // (p. ej. sin conexión), para no dejar al usuario atrapado en la sesión.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
