import { Alert, Platform } from 'react-native';

/**
 * true en la vista previa web (`npx expo start --web`, ej. en el navegador de
 * VS Code). Es una función para que los tests puedan cambiar Platform.OS.
 */
export function isWeb(): boolean {
  return Platform.OS === 'web';
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Texto del botón que confirma (ej. "Cerrar sesión"). */
  confirmText: string;
  /** Acción destructiva: el botón se muestra en rojo (iOS). */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Diálogo de confirmación. En el teléfono usa Alert; en web, Alert de
 * react-native-web no muestra nada, por eso se usa window.confirm.
 */
export function confirmAction({ title, message, confirmText, destructive = false, onConfirm }: ConfirmOptions): void {
  if (isWeb()) {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
