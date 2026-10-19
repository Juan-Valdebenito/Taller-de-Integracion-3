import { useCallback, useEffect, useState } from 'react';

/**
 * Cuenta regresiva en segundos. Se usa cuando backend-go responde 429 (rate
 * limiting): el formulario queda bloqueado hasta que pasa el Retry-After.
 */
export function useCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => {
    setSecondsLeft(Math.max(0, Math.ceil(seconds)));
  }, []);

  return { secondsLeft, active: secondsLeft > 0, start };
}
