import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '../auth/AuthContext';
import { notificationsSupported } from '../notifications/notificationService';

/** Pantalla que abre una notificación según su tipo y el rol de quien la toca; null = ninguna. */
export function notificationTarget(data: unknown, role: string | undefined): Href | null {
  const type = data && typeof data === 'object' ? (data as Record<string, unknown>).type : undefined;
  if (type === 'complaint-status' && role === 'PASSENGER') return '/complaints';
  return null;
}

/**
 * Toques ya atendidos. Vive fuera del componente: si la raíz se vuelve a montar
 * al navegar, el mismo toque no debe abrir la pantalla otra vez.
 */
const handledResponses = new WeakSet<Notifications.NotificationResponse>();

/**
 * Al tocar un aviso del servidor (por ejemplo, la respuesta a un reclamo) abre
 * la pantalla que corresponde. Sirve también si el toque abrió la app desde
 * cerrada: espera a que haya sesión. Va una sola vez, en la raíz de la app.
 */
export function useNotificationNavigation(): void {
  // La condición no cambia mientras corre la app (es la plataforma), así que el
  // orden de los hooks es siempre el mismo. En la web no hay notificaciones.
  const response = notificationsSupported() ? Notifications.useLastNotificationResponse() : null;
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!response || handledResponses.has(response) || status !== 'signedIn') return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handledResponses.add(response);
    const target = notificationTarget(response.notification.request.content.data, user?.role);
    // Se olvida para que no vuelva a abrir la pantalla al reabrir la app.
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    if (target) router.push(target);
  }, [response, status, user?.role, router]);
}
