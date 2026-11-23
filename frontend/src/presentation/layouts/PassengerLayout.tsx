import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WebSocketStatusBanner } from '../components/feedback/WebSocketStatusBanner';
import styles from './PassengerLayout.module.css';

export function PassengerLayout() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMapRoute = location.pathname === '/map' || location.pathname === '/passenger/map';
  const isComplaintsRoute = location.pathname === '/passenger/complaints';

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <span className={styles.navLogo}>🚌</span>
          <span className={styles.navTitle}>TransitHub</span>
        </div>
        {isAuthenticated && (
          <div className={styles.navLinks}>
            <NavLink
              to="/passenger/map"
              className={`${styles.navLink} ${isMapRoute ? styles.navLinkActive : ''}`}
            >
              🗺️ Mapa
            </NavLink>
            <NavLink
              to="/passenger/complaints"
              className={`${styles.navLink} ${isComplaintsRoute ? styles.navLinkActive : ''}`}
            >
              📋 Reclamos
            </NavLink>
          </div>
        )}
        {isAuthenticated ? (
          <button type="button" className={styles.navLogoutBtn} onClick={handleLogout}>
            Cerrar sesión
          </button>
        ) : (
          <div className={styles.navAuthLinks}>
            <NavLink to="/auth/login" className={styles.navAuth}>
              Iniciar sesión
            </NavLink>
            <NavLink to="/auth/register" className={styles.navRegister}>
              Registrarse
            </NavLink>
          </div>
        )}
      </nav>
      <main className={styles.main}>
        <WebSocketStatusBanner />
        <Outlet />
      </main>
    </div>
  );
}
