import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../../infrastructure/api/apiClient';
import type { AuthUser } from '../../context/AuthContext';

// ── Mapa de rol → ruta home ───────────────────────────────────────────────────
const ROLE_HOME: Record<string, string> = {
  PASSENGER: '/passenger/map',
  COMPANY:   '/company/dashboard',
  ADMIN:     '/admin/dashboard',
};

// ── Componente ────────────────────────────────────────────────────────────────
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  // Tras el login volver a la URL original o ir al portal del rol
  const from = (location.state as { from?: Location })?.from?.pathname;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await apiClient.post<{ token: string; user: AuthUser }>(
        '/auth/login',
        { email, password },
      );

      login(data.token, data.user);

      // Redirigir a la URL previa o al portal del rol
      const destination = from ?? ROLE_HOME[data.user.role] ?? '/';
      navigate(destination, { replace: true });

    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error ?? 'Error al iniciar sesión. Intenta de nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-8)',
      width: '100%',
      maxWidth: '420px',
    }}>
      {/* Encabezado */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <span style={{ fontSize: '2.5rem' }}>🚌</span>
        <h1 style={{
          fontSize: 'var(--font-size-xl)',
          fontWeight: 700,
          marginTop: 'var(--space-2)',
          marginBottom: 'var(--space-1)',
        }}>
          Iniciar sesión
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Plataforma de Transporte Público
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'hsla(0,84%,55%,0.12)',
          border: '1px solid hsla(0,84%,55%,0.35)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          color: 'hsl(0,84%,65%)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--space-5)',
        }}>
          {error}
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label
            htmlFor="login-email"
            style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}
          >
            Correo electrónico
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@ejemplo.com"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-base)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label
            htmlFor="login-password"
            style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}
          >
            Contraseña
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-base)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
        </div>

        <button
          id="login-submit"
          type="submit"
          disabled={loading}
          style={{
            marginTop: 'var(--space-2)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: loading
              ? 'var(--color-surface-2)'
              : 'linear-gradient(135deg, hsl(215,80%,55%), hsl(200,95%,47%))',
            color: loading ? 'var(--color-text-muted)' : '#fff',
            fontSize: 'var(--font-size-base)',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>

      {/* Pie */}
      <p style={{
        textAlign: 'center',
        marginTop: 'var(--space-5)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)',
      }}>
        ¿No tienes cuenta?{' '}
        <Link
          to="/auth/register"
          style={{ color: 'hsl(200,95%,55%)', fontWeight: 600, textDecoration: 'none' }}
        >
          Regístrate
        </Link>
      </p>
    </div>
  );
}
