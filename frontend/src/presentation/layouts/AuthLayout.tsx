import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 'var(--space-4)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <span style={{ fontSize: '3rem' }}>🚌</span>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginTop: 'var(--space-2)' }}>
            TransitHub
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Plataforma de Transporte Público Urbano
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
