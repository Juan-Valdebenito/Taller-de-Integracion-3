/** Roles de usuario de backend-go. La app móvil registra pasajeros. */
export type UserRole = 'PASSENGER' | 'COMPANY' | 'ADMIN';

/** Usuario tal como lo devuelve backend-go (sin el hash de la contraseña). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  companyId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Par de tokens JWT: access (vida corta, ~15 min) y refresh (rotativo, ~7 días). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Respuesta de POST /auth/login, /auth/register y /auth/refresh. */
export interface AuthResponse extends TokenPair {
  user: AuthUser;
  /** Alias de accessToken que mantiene backend-go por compatibilidad con la web. */
  token?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}
