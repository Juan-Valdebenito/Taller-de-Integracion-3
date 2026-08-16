import { Outlet, NavLink } from 'react-router-dom';
import styles from './PassengerLayout.module.css';

export function PassengerLayout() {
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
        <NavLink to="/auth/login" className={styles.navAuth}>
          Iniciar sesión
        </NavLink>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
