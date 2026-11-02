import { Alert, Platform, type AlertButton } from 'react-native';

import { confirmAction, isWeb } from '../platform';

const options = { title: 'Cerrar sesión', message: '¿Seguro?', confirmText: 'Cerrar sesión', destructive: true };

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { confirm?: unknown }).confirm;
});

describe('confirmAction', () => {
  it('en el teléfono muestra un Alert con Cancelar y la acción', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmAction({ ...options, onConfirm });

    expect(alertSpy).toHaveBeenCalledWith('Cerrar sesión', '¿Seguro?', expect.any(Array));
    const buttons: AlertButton[] = alertSpy.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancelar', 'cancel'],
      ['Cerrar sesión', 'destructive'],
    ]);
    buttons[1].onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  describe('en web (Alert no muestra nada en el navegador)', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    it('usa window.confirm y ejecuta la acción si el usuario acepta', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (globalThis as { confirm?: unknown }).confirm = jest.fn(() => true);
      const onConfirm = jest.fn();

      confirmAction({ ...options, onConfirm });

      expect(isWeb()).toBe(true);
      expect(globalThis.confirm).toHaveBeenCalledWith('Cerrar sesión\n\n¿Seguro?');
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('si el usuario cancela, no hace nada', () => {
      (globalThis as { confirm?: unknown }).confirm = jest.fn(() => false);
      const onConfirm = jest.fn();

      confirmAction({ ...options, onConfirm });

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
