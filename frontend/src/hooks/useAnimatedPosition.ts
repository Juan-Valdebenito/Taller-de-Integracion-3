/**
 * useAnimatedPosition.ts
 *
 * Hook que interpola suavemente entre posiciones geográficas usando
 * requestAnimationFrame. Elimina el "salto" instantáneo cuando llega
 * una nueva coordenada del WebSocket.
 *
 * Usa easing ease-out cubic para un movimiento natural.
 */

import { useRef, useEffect, useState, useCallback } from 'react';

/** Interpola linealmente entre a y b con factor t (0..1) */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface AnimatedPosition {
  lat: number;
  lng: number;
  heading: number;
}

/**
 * Interpola suavemente la posición de un marcador en el mapa.
 *
 * @param targetLat — Latitud destino (del WS)
 * @param targetLng — Longitud destino (del WS)
 * @param targetHeading — Heading destino en grados
 * @param durationMs — Duración de la animación (default 1500ms)
 */
export function useAnimatedPosition(
  targetLat: number,
  targetLng: number,
  targetHeading: number,
  durationMs = 1800,
): AnimatedPosition {
  const initialPosition = {
    lat: targetLat,
    lng: targetLng,
    heading: targetHeading,
  };
  const [pos, setPos] = useState<AnimatedPosition>(initialPosition);

  const rafRef = useRef<number | null>(null);
  const currentRef = useRef<AnimatedPosition>(initialPosition);
  const targetRef = useRef<AnimatedPosition>(initialPosition);
  const lastTargetTimeRef = useRef<number | null>(null);
  const animationRef = useRef<{
    from: AnimatedPosition;
    to: AnimatedPosition;
    startedAt: number;
    duration: number;
  } | null>(null);

  const animate = useCallback((timestamp: number) => {
    const animation = animationRef.current;
    if (!animation) {
      rafRef.current = null;
      return;
    }

    const progress = Math.min((timestamp - animation.startedAt) / animation.duration, 1);
    const nextPosition = {
      lat: lerp(animation.from.lat, animation.to.lat, progress),
      lng: lerp(animation.from.lng, animation.to.lng, progress),
      heading: interpolateHeading(animation.from.heading, animation.to.heading, progress),
    };

    currentRef.current = nextPosition;
    setPos(nextPosition);

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      animationRef.current = null;
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const now = performance.now();
    const target = { lat: targetLat, lng: targetLng, heading: targetHeading };
    const previousTargetTime = lastTargetTimeRef.current;
    const updateInterval = previousTargetTime === null ? durationMs : now - previousTargetTime;
    const animationDuration = Math.min(Math.max(updateInterval * 1.08, 700), durationMs + 500);

    targetRef.current = target;
    lastTargetTimeRef.current = now;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    animationRef.current = {
      from: currentRef.current,
      to: targetRef.current,
      startedAt: now,
      duration: animationDuration,
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate, durationMs, targetHeading, targetLat, targetLng]);

  return pos;
}

function interpolateHeading(from: number, to: number, progress: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return ((from + delta * progress) % 360 + 360) % 360;
}
