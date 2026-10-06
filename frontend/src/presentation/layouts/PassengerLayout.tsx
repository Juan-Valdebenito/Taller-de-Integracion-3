import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './PassengerLayout.module.css';

export function PassengerLayout() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

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
        <div className={styles.navLinks}>
          <NavLink
            to="/passenger/map"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            🗺️ Mapa
          </NavLink>
          <NavLink
            to="/passenger/complaints"
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            📋 Reclamos
          </NavLink>
        </div>
        {isAuthenticated ? (
          <button type="button" className={styles.navLogoutBtn} onClick={handleLogout}>
            Cerrar sesión
          </button>
        ) : (
          <NavLink to="/auth/login" className={styles.navAuth}>
            Iniciar sesión
          </NavLink>
        )}
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
