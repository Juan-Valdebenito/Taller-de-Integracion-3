/**
 * Ícono de micro del mapa, igual a createBusIcon del web
 * (frontend/src/presentation/components/map/BusMarker.tsx): halo y cuerpo del
 * color de la ocupación, flecha blanca girada según el rumbo y pictograma de micro.
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
      <svg x="${half - 10}" y="${half - 10}" width="20" height="20" viewBox="0 0 24 24" aria-label="Micro">
        <path d="M7.5 2.5h9c2 0 3.5 1.6 3.5 3.6v11.5c0 1-.4 1.9-1.2 2.7l-1.2 1.2H6.4l-1.2-1.2C4.4 19.5 4 18.6 4 17.6V6.1c0-2 1.5-3.6 3.5-3.6Z" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        <path d="M7.2 5.2a1.4 1.4 0 0 1 1.4-1.3h6.8a1.4 1.4 0 0 1 1.4 1.3v4.4H7.2Z" fill="#172033"/>
        <rect x="7.2" y="11" width="4.3" height="4.3" rx=".8" fill="#e0f2fe"/>
        <rect x="12.5" y="11" width="4.3" height="4.3" rx=".8" fill="#e0f2fe"/>
        <path d="M9.3 17h5.4v1.5H9.3z" fill="#172033"/>
        <path d="M2.7 6.8h2v4h-2zm16.6 0h2v4h-2zM2.7 14.2h2v4h-2zm16.6 0h2v4h-2z" fill="#0f172a"/>
        <circle cx="7.4" cy="5.2" r=".75" fill="#fef3c7"/><circle cx="16.6" cy="5.2" r=".75" fill="#fef3c7"/>
      </svg>
    </svg>
  `;
}
