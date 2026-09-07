import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';

// ── Mapa de rol → ruta home ───────────────────────────────────────────────────

const ROLE_HOME: Record<UserRole, string> = {
  PASSENGER: '/passenger/map',
  COMPANY:   '/company/dashboard',
  ADMIN:     '/admin/dashboard',
};

// ── RequireAuth ───────────────────────────────────────────────────────────────

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Protege rutas que requieren autenticación.
 * Si el usuario no tiene sesión, redirige a /auth/login conservando la URL
 * original en `state.from` para poder volver tras el login.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null; // Espera hidratación del contexto

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ── RequireRole ───────────────────────────────────────────────────────────────

interface RequireRoleProps {
  /** Rol o roles que tienen acceso a este grupo de rutas. */
  allowedRoles: UserRole[];
  children: ReactNode;
}

/**
 * Protege rutas por rol.
 * Si el usuario autenticado tiene un rol distinto al permitido,
 * lo redirige a la ruta home de su propio rol en lugar de mostrar un 403.
 *
 * Ejemplo: un PASSENGER que intenta entrar a /admin/dashboard
 * es redirigido a /passenger/map.
 */
export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  // Si el rol del usuario no está en la lista de permitidos,
  // redirigir a su portal correspondiente.
  if (!user || !allowedRoles.includes(user.role)) {
    const home = user ? ROLE_HOME[user.role] : '/auth/login';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
