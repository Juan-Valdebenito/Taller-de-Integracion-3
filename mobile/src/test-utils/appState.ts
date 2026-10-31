/**
 * Utilidades de test: simula los cambios de estado de la app (AppState).
 *
 * Reemplaza AppState.addEventListener y restore() deja la función original.
 * No usa jest.spyOn: en jest-expo addEventListener ya es un mock, y spyOn +
 * mockRestore le borraría la implementación para los tests siguientes.
 */
import { AppState, type AppStateStatus } from 'react-native';

type Listener = (state: AppStateStatus) => void;

export function mockAppState() {
  const original = AppState.addEventListener;
  const subscriptions: Array<{ listener: Listener; remove: jest.Mock }> = [];

  AppState.addEventListener = ((_type: string, listener: Listener) => {
    const remove = jest.fn();
    subscriptions.push({ listener, remove });
    return { remove };
  }) as unknown as typeof AppState.addEventListener;

  const active = () => subscriptions.filter((s) => s.remove.mock.calls.length === 0);
  return {
    /** Avisa a los listeners que siguen registrados que la app pasó a `state`. */
    emit: (state: AppStateStatus) => active().forEach((s) => s.listener(state)),
    /** Cantidad de listeners registrados y de los que siguen sin quitar. */
    counts: () => ({ registered: subscriptions.length, active: active().length }),
    restore: () => {
      AppState.addEventListener = original;
    },
  };
}
