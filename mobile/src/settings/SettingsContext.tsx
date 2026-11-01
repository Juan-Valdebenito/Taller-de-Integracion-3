import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settingsStorage';

export interface SettingsContextValue {
  settings: Settings;
  /** false hasta leer las preferencias guardadas (la app espera para no parpadear el tema). */
  loaded: boolean;
  /** Mensaje si el último cambio no se pudo guardar (el cambio sí se aplica en la app). */
  saveError: string | null;
  updateSettings: (changes: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Preferencias del pasajero para toda la app; los cambios se aplican al instante y se guardan. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Valor vigente, para encadenar cambios rápidos sin perder ninguno. */
  const current = useRef<Settings>(settings);
  /** Guardados en cola: se escriben en orden, el último cambio siempre gana. */
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((stored) => {
      if (cancelled) return;
      current.current = stored;
      setSettings(stored);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Settings) => {
    current.current = next;
    setSettings(next);
    writes.current = writes.current.then(async () => {
      try {
        await saveSettings(next);
        setSaveError(null);
      } catch {
        setSaveError('No se pudo guardar la configuración. Se aplicará solo hasta cerrar la app.');
      }
    });
    return writes.current;
  }, []);

  const updateSettings = useCallback(
    (changes: Partial<Settings>) => persist({ ...current.current, ...changes }),
    [persist],
  );

  const resetSettings = useCallback(() => persist({ ...DEFAULT_SETTINGS }), [persist]);

  const value = useMemo(
    () => ({ settings, loaded, saveError, updateSettings, resetSettings }),
    [settings, loaded, saveError, updateSettings, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  }
  return value;
}
