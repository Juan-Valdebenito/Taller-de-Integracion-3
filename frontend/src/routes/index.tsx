import { createBrowserRouter, Navigate } from 'react-router-dom';

// Guards de autenticación y rol
import { RequireAuth, RequireRole } from '../presentation/components/auth/RouteGuards';

// Layouts
import { PassengerLayout } from '../presentation/layouts/PassengerLayout';
import { CompanyLayout } from '../presentation/layouts/CompanyLayout';
import { AdminLayout } from '../presentation/layouts/AdminLayout';
import { AuthLayout } from '../presentation/layouts/AuthLayout';

// Auth pages
import { LoginPage } from '../presentation/pages/auth/LoginPage';
import { RegisterPage } from '../presentation/pages/auth/RegisterPage';

// Passenger pages
import { PassengerMapPage } from '../presentation/pages/passenger/PassengerMapPage';
import { PassengerComplaintsPage } from '../presentation/pages/passenger/PassengerComplaintsPage';

// Company pages
import { CompanyDashboardPage } from '../presentation/pages/company/CompanyDashboardPage';
import { CompanyBusesPage } from '../presentation/pages/company/CompanyBusesPage';
import { CompanyRoutesPage } from '../presentation/pages/company/CompanyRoutesPage';
import { CompanyComplaintsPage } from '../presentation/pages/company/CompanyComplaintsPage';

// Admin pages
import { AdminDashboardPage } from '../presentation/pages/admin/AdminDashboardPage';
import { AdminUsersPage } from '../presentation/pages/admin/AdminUsersPage';
import { AdminRoutesPage } from '../presentation/pages/admin/AdminRoutesPage';
import { AdminCompaniesPage } from '../presentation/pages/admin/AdminCompaniesPage';
import { AdminComplaintsPage } from '../presentation/pages/admin/AdminComplaintsPage';

export const router = createBrowserRouter([
  // ── Redirección raíz ─────────────────────────────────────
  {
    path: '/',
    element: <Navigate to="/passenger/map" replace />,
  },

  // ── Autenticación (rutas públicas) ───────────────────────
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
    ],
  },

  // ── Pasajero ─────────────────────────────────────────────
  // RequireAuth → redirige a /auth/login si no autenticado
  // RequireRole → redirige al portal propio si el rol no es PASSENGER
  {
    path: '/passenger',
    element: (
      <RequireAuth>
        <RequireRole allowedRoles={['PASSENGER']}>
          <PassengerLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/passenger/map" replace /> },
      { path: 'map', element: <PassengerMapPage /> },
      { path: 'complaints', element: <PassengerComplaintsPage /> },
    ],
  },

  // ── Empresa / Sucursal ────────────────────────────────────
  {
    path: '/company',
    element: (
      <RequireAuth>
        <RequireRole allowedRoles={['COMPANY']}>
          <CompanyLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/company/dashboard" replace /> },
      { path: 'dashboard', element: <CompanyDashboardPage /> },
      { path: 'buses', element: <CompanyBusesPage /> },
      { path: 'routes', element: <CompanyRoutesPage /> },
      { path: 'complaints', element: <CompanyComplaintsPage /> },
    ],
  },

  // ── Administrador ─────────────────────────────────────────
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <RequireRole allowedRoles={['ADMIN']}>
          <AdminLayout />
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboardPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'routes', element: <AdminRoutesPage /> },
      { path: 'companies', element: <AdminCompaniesPage /> },
      { path: 'complaints', element: <AdminComplaintsPage /> },
    ],
  },
]);
