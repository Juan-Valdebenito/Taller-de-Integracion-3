import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'PASSENGER' | 'COMPANY'>('PASSENGER');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await axios.post('http://localhost:3001/api/v1/auth/register', {
        name,
        email,
        password,
        role,
      });

      const { token, user } = res.data.data;
      login(token, user);

      if (user.role === 'COMPANY') {
        navigate('/company/dashboard');
      } else {
        navigate('/passenger/map');
      }
    } catch (err: any) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors && Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        setErrorMessage(fieldErrors.map((fe: any) => fe.message).join('. '));
      } else {
        setErrorMessage(
          err.response?.data?.message || 'Ocurrió un error al registrar la cuenta.'
        );
      }
    } finally {
      setIsLoading(false);
    }
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
        Crear cuenta
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
        Tus datos son sanitizados y tu contraseña es hasheada con bcrypt
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
          textAlign: 'left',
        }}>
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
            Nombre Completo
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Valdebenito"
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
            Correo electrónico
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="juan@ejemplo.cl"
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
            Contraseña (Mín. 8 caracteres, letras y números)
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Al menos 8 caracteres..."
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
            Tipo de Usuario
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'inherit',
              boxSizing: 'border-box',
            }}
          >
            <option value="PASSENGER">Pasajero Frecuente</option>
            <option value="COMPANY">Operador / Empresa de Buses</option>
          </select>
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
          {isLoading ? 'Registrando y Protegiendo Datos...' : 'Crear Cuenta Segura'}
        </button>
      </form>

      <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        ¿Ya tienes cuenta?{' '}
        <Link to="/auth/login" style={{ color: '#38bdf8', fontWeight: 600 }}>
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}

