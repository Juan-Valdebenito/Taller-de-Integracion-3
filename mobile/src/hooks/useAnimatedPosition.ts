import { useEffect, useRef, useState } from 'react';

/**
 * Movimiento suave de una micro entre actualizaciones, igual que
 * useAnimatedPosition del web: interpola posición y rumbo con
 * requestAnimationFrame, y la duración se adapta al ritmo de los mensajes.
 */

export interface AnimatedPosition {
  latitude: number;
  longitude: number;
  heading: number;
}

/** Duración por defecto de la animación (ms), como el web. */
export const ANIMATION_MS = 1800;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpola el rumbo por el camino más corto (de 350° a 10° pasa por 0°). */
export function interpolateHeading(from: number, to: number, progress: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (((from + delta * progress) % 360) + 360) % 360;
}

/**
 * Duración de la animación según cada cuánto llegan las posiciones: un poco
 * más que el intervalo (×1.08, para no detenerse antes del siguiente mensaje),
 * entre 700 ms y ANIMATION_MS + 500 ms.
 */
export function animationDuration(intervalMs: number | null, baseMs: number = ANIMATION_MS): number {
  const interval = intervalMs ?? baseMs;
  return Math.min(Math.max(interval * 1.08, 700), baseMs + 500);
}

export function useAnimatedPosition(latitude: number, longitude: number, heading: number, baseMs: number = ANIMATION_MS): AnimatedPosition {
  const [position, setPosition] = useState<AnimatedPosition>({ latitude, longitude, heading });
  const current = useRef(position);
  const lastTargetAt = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = current.current;
    const to = { latitude, longitude, heading };
    const duration = animationDuration(lastTargetAt.current === null ? null : start - lastTargetAt.current, baseMs);
    lastTargetAt.current = start;

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const next = {
        latitude: lerp(from.latitude, to.latitude, progress),
        longitude: lerp(from.longitude, to.longitude, progress),
        heading: interpolateHeading(from.heading, to.heading, progress),
      };
      current.current = next;
      setPosition(next);
      frame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [latitude, longitude, heading, baseMs]);

  return position;
}
