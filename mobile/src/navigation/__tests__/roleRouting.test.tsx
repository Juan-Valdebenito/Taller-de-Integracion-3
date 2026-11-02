import * as Notifications from 'expo-notifications';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '../../app/_layout';
import { useAuth } from '../../auth/AuthContext';
import type { UserRole } from '../../auth/types';
import { mockAuthValue } from '../../test-utils/auth';

// Navegación por rol con la ruta raíz real (app/_layout): cada rol solo puede
// abrir su sección, como el web (/passenger, /company, /admin).

jest.mock('../../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: jest.fn(),
}));
jest.mock('@expo-google-fonts/inter', () => ({ useFonts: () => [true, null] }));
jest.mock('../../notifications/notificationService', () => ({ setupNotifications: jest.fn(() => Promise.resolve()), notificationsSupported: () => true }));

/** Rutas reales del layout raíz, con una pantalla simple en cada sección. */
const routes = {
  _layout: RootLayout,
  // Con layout propio, como en la app: la sección del pasajero es un grupo protegido.
  '(app)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(app)/index': () => <Text>sección pasajero</Text>,
  '(app)/complaints': () => <Text>reclamos del pasajero</Text>,
  'company/index': () => <Text>sección empresa</Text>,
  'admin/index': () => <Text>sección administración</Text>,
  login: () => <Text>pantalla de login</Text>,
  register: () => <Text>pantalla de registro</Text>,
};

function signedInAs(role: UserRole) {
  jest
    .mocked(useAuth)
    .mockReturnValue(mockAuthValue({ status: 'signedIn', user: { id: 'u1', name: 'Ana', email: 'ana@correo.cl', role } }));
}

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ status: 'signedOut' }));
});

describe('navegación por rol', () => {
  it.each([
    ['PASSENGER', 'sección pasajero', '/'],
    ['COMPANY', 'sección empresa', '/company'],
    ['ADMIN', 'sección administración', '/admin'],
  ] as const)('al entrar, %s va a su sección', async (role, text, pathname) => {
    signedInAs(role);
    const router = await renderRouter(routes, { initialUrl: '/login' });

    expect(await screen.findByText(text)).toBeTruthy();
    expect(router.getPathname()).toBe(pathname);
  });

  it.each([
    ['PASSENGER', '/admin', 'sección pasajero', 'sección administración'],
    ['PASSENGER', '/company', 'sección pasajero', 'sección empresa'],
    ['COMPANY', '/admin', 'sección empresa', 'sección administración'],
    ['COMPANY', '/', 'sección empresa', 'sección pasajero'],
    ['ADMIN', '/company', 'sección administración', 'sección empresa'],
    ['ADMIN', '/', 'sección administración', 'sección pasajero'],
  ] as const)('%s no puede abrir %s: queda en su sección', async (role, url, own, other) => {
    signedInAs(role);
    await renderRouter(routes, { initialUrl: url });

    expect(await screen.findByText(own)).toBeTruthy();
    expect(screen.queryByText(other)).toBeNull();
  });

  it('sin sesión solo se puede ver el login y el registro', async () => {
    const router = await renderRouter(routes, { initialUrl: '/company' });

    expect(await screen.findByText('pantalla de login')).toBeTruthy();
    expect(router.getPathname()).toBe('/login');
  });
});

describe('tocar un aviso del servidor', () => {
  const complaintTap = {
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: { request: { content: { data: { type: 'complaint-status', complaintId: 'c1', status: 'RESOLVED' } } } },
  } as unknown as Notifications.NotificationResponse;

  afterEach(() => jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(null));

  it('el aviso de un reclamo lleva al pasajero a Reclamos y se olvida', async () => {
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(complaintTap);
    signedInAs('PASSENGER');
    const router = await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('reclamos del pasajero')).toBeTruthy();
    expect(router.getPathname()).toBe('/complaints');
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('sin sesión no navega (espera a que entre)', async () => {
    jest.mocked(Notifications.clearLastNotificationResponseAsync).mockClear();
    jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue({ ...complaintTap });
    await renderRouter(routes, { initialUrl: '/login' });

    expect(await screen.findByText('pantalla de login')).toBeTruthy();
    expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });
});
