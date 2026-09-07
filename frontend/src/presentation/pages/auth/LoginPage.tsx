import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:3001/api/v1/auth/login', {
        email,
        password,
      });

      const { token, user } = res.data;
      login(token, user);

      if (user.role === 'ADMIN') {
        navigate('/admin/dashboard');
      } else if (user.role === 'COMPANY') {
        navigate('/company/dashboard');
      } else {
        navigate('/passenger/map');
      }
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setErrorMessage(
        err.response?.data?.message || 'Error al iniciar sesión. Verifica tus credenciales.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div style={{
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-8)',
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
    }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Iniciar sesión
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
        Ingresa tus credenciales protegidas con hash bcrypt
      </p>

      {errorMessage && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '13px',
          marginBottom: '16px',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }}>
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
            Correo electrónico
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ejemplo@transporte.cl"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            marginTop: '8px',
            padding: '12px',
            background: 'var(--color-primary-600, #2563eb)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: isLoading ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {isLoading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>

      {/* Cuentas Demo de prueba rápida */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
          CUENTAS DE PRUEBA SIMULADAS (CON HASH BCRYPT):
        </span>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => handleFillDemo('admin@transporte.cl', 'Admin1234!')}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => handleFillDemo('carlos.pasajero@gmail.com', 'Pasajero1234!')}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid #4ade80',
              color: '#4ade80',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Pasajero
          </button>
        </div>
      </div>

      <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        ¿No tienes cuenta?{' '}
        <Link to="/auth/register" style={{ color: '#38bdf8', fontWeight: 600 }}>
          Regístrate aquí
        </Link>
      </p>
    </div>
  );
}

