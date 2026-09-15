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

/** Easing ease-out cubic: desacelera suavemente al final */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

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
  durationMs = 1500,
): AnimatedPosition {
  const [pos, setPos] = useState<AnimatedPosition>({
    lat: targetLat,
    lng: targetLng,
    heading: targetHeading,
  });

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{
    lat: number;
    lng: number;
    heading: number;
    time: number;
  } | null>(null);

  const animate = useCallback(
    (timestamp: number) => {
      const start = startRef.current;
      if (!start) return;

      const elapsed = timestamp - start.time;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutCubic(progress);

      const newLat = lerp(start.lat, targetLat, eased);
      const newLng = lerp(start.lng, targetLng, eased);

      // Interpolar heading (manejo de wrap-around 0-360)
      let dHeading = targetHeading - start.heading;
      if (dHeading > 180) dHeading -= 360;
      if (dHeading < -180) dHeading += 360;
      const newHeading = start.heading + dHeading * eased;

      setPos({
        lat: newLat,
        lng: newLng,
        heading: ((newHeading % 360) + 360) % 360,
      });

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    },
    [targetLat, targetLng, targetHeading, durationMs],
  );

  useEffect(() => {
    // Cancelar animación anterior
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Guardar posición actual como inicio de la nueva animación
    startRef.current = {
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading,
      time: performance.now(),
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLat, targetLng, targetHeading, animate]);

  return pos;
}
