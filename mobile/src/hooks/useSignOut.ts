import { useCallback, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { confirmAction } from '../utils/platform';

/**
 * Cerrar sesión con confirmación (Perfil y barra superior). Envía el access y
 * el refresh token a la lista negra del backend Go (POST /auth/logout) y borra
 * la sesión del dispositivo; al cambiar la sesión, Stack.Protected lleva al login.
 */
export function useSignOut() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  const confirmSignOut = useCallback(() => {
    confirmAction({
      title: 'Cerrar sesión',
      message: '¿Quieres cerrar tu sesión en este dispositivo?',
      confirmText: 'Cerrar sesión',
      destructive: true,
      onConfirm: doSignOut,
    });
  }, [doSignOut]);

  return { signingOut, confirmSignOut };
}
