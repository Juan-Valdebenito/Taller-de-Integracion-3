/**
 * Ícono de micro del mapa, igual a createBusIcon del web
 * (frontend/src/presentation/components/map/BusMarker.tsx): halo y cuerpo del
 * color de la ocupación, flecha blanca girada según el rumbo y 🚌 al centro.
 */
import type { LiveBus } from '../../realtime/liveBuses';
import { occupancyColor } from '../../theme/status';

/** Diámetro del ícono: 36 px, 46 si la micro está seleccionada. */
export const busIconSize = (selected: boolean) => (selected ? 46 : 36);

/** Color de la micro: el que calcula el backend o, si no viene, el de su ocupación. */
export function busColor(bus: LiveBus): string {
  return bus.occupancy?.occupancyColor || occupancyColor(bus.currentPassengers, bus.capacity);
}

/** El web resalta la micro que recibió un mensaje del WebSocket hace menos de 3 s. */
export const RECENT_MS = 3000;

/** SVG del ícono (el mismo del web; lo usa la versión web del mapa). */
export function busIconSvg(color: string, heading: number, selected: boolean, recent: boolean): string {
  const size = busIconSize(selected);
  const half = size / 2;
  const pulse = selected
    ? `<circle cx="${half}" cy="${half}" r="${half - 2}" fill="none" stroke="${color}" stroke-width="2" opacity="0.3">
        <animate attributeName="r" from="${half - 2}" to="${half + 8}" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.3" to="0" dur="1.6s" repeatCount="indefinite"/>
       </circle>`
    : '';
  const glow = recent
    ? `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="${color}" opacity="0.12">
        <animate attributeName="opacity" from="0.2" to="0.05" dur="2s" repeatCount="1" fill="freeze"/>
       </circle>`
    : '';
  const arrowSize = selected ? 6 : 5;
  const arrowY = half - (selected ? 16 : 12);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      ${glow}
      <circle cx="${half}" cy="${half}" r="${half - 3}" fill="${color}" opacity="0.18"/>
      <circle cx="${half}" cy="${half}" r="${half - 7}" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
      <g transform="rotate(${heading}, ${half}, ${half})">
        <polygon points="${half},${arrowY} ${half - arrowSize},${arrowY + arrowSize + 2} ${half + arrowSize},${arrowY + arrowSize + 2}"
          fill="rgba(255,255,255,0.9)" stroke="none"/>
      </g>
      <text x="${half}" y="${half + 5}" text-anchor="middle" font-size="${selected ? 16 : 13}" font-family="system-ui">🚌</text>
    </svg>
  `;
}
