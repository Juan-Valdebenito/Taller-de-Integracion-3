import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/admin/companies', icon: '🏢', label: 'Empresas' },
  { to: '/admin/routes', icon: '🗺️', label: 'Rutas' },
  { to: '/admin/users', icon: '👥', label: 'Usuarios' },
  { to: '/admin/complaints', icon: '📋', label: 'Reclamos' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        style={{
          width: collapsed ? '72px' : '240px',
          background: 'linear-gradient(180deg, hsl(220,22%,11%) 0%, hsl(220,20%,9%) 100%)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width var(--transition-normal)',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: collapsed ? 'var(--space-5) var(--space-4)' : 'var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            minHeight: '72px',
          }}
        >
          <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>🚌</span>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                TransitHub
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: 'linear-gradient(90deg, var(--color-primary-400), hsl(199,89%,60%))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginTop: '2px',
                }}
              >
                Administración
              </div>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          id="sidebar-toggle-btn"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            position: 'absolute',
            top: '22px',
            right: '-12px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 20,
            transition: 'all var(--transition-fast)',
          }}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '›' : '‹'}
        </button>

        {/* Nav links */}
        <nav
          style={{
            flex: 1,
            padding: 'var(--space-4) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {!collapsed && (
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', padding: '0 var(--space-2)' }}>
              Menú principal
            </p>
          )}
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: collapsed ? 'var(--space-3)' : 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                background: isActive
                  ? 'linear-gradient(135deg, hsla(215,80%,46%,0.2), hsla(199,89%,48%,0.1))'
                  : 'transparent',
                boxShadow: isActive ? 'inset 0 0 0 1px hsla(215,80%,60%,0.15)' : 'none',
                fontWeight: isActive ? 600 : 400,
                fontSize: 'var(--font-size-sm)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
                justifyContent: collapsed ? 'center' : undefined,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              })}
            >
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-3)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              justifyContent: collapsed ? 'center' : undefined,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name ?? 'Administrador'}
                </p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Admin · SuperUser
                </p>
              </div>
            )}
          </div>
          <button
            id="admin-logout-btn"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-xs)',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span>⇠</span>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header
          style={{
            height: '72px',
            background: 'hsla(220,20%,9%,0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--space-8)',
            gap: 'var(--space-4)',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          <div style={{ flex: 1 }} />
          {/* Status badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'hsla(142,71%,45%,0.1)',
              border: '1px solid hsla(142,71%,45%,0.3)',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-success)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-success)',
                boxShadow: '0 0 6px var(--color-success)',
                animation: 'pulse 2s infinite',
              }}
            />
            Sistema Operativo
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'auto', padding: 'var(--space-8)' }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        nav a:hover {
          background: hsla(215,80%,46%,0.08) !important;
          color: var(--color-text-primary) !important;
        }
        #admin-logout-btn:hover {
          background: hsla(0,84%,60%,0.1) !important;
          border-color: hsla(0,84%,60%,0.3) !important;
          color: var(--color-danger) !important;
        }
      `}</style>
    </div>
  );
}
