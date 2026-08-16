import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: '240px',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border)',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}>
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <span style={{ fontSize: '1.5rem' }}>🚌</span>
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginLeft: 'var(--space-2)' }}>
            TransitHub
          </span>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-400)', marginTop: 'var(--space-1)', fontWeight: 600 }}>
            Administración
          </p>
        </div>

        {[
          { to: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
          { to: '/admin/companies', icon: '🏢', label: 'Empresas' },
          { to: '/admin/routes', icon: '🗺️', label: 'Rutas' },
          { to: '/admin/users', icon: '👥', label: 'Usuarios' },
        ].map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              color: isActive ? 'var(--color-primary-400)' : 'var(--color-text-secondary)',
              background: isActive ? 'hsla(215, 80%, 46%, 0.15)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 'var(--font-size-sm)',
              textDecoration: 'none',
              transition: 'all var(--transition-fast)',
            })}
          >
            <span>{icon}</span> {label}
          </NavLink>
        ))}

        <div style={{ marginTop: 'auto' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{user?.name} · Admin</p>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              marginTop: 'var(--space-2)',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', padding: 'var(--space-8)' }}>
        <Outlet />
      </main>
    </div>
  );
}
