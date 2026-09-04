/**
 * RouteFilter.tsx
 *
 * Selector de ruta para filtrar qué micros ver en el mapa.
 * Muestra el conteo de micros activas por ruta.
 */

import { BusState } from '../../../hooks/useSimulatedBuses';

interface RouteFilterProps {
  buses: BusState[];
  value: string;
  onChange: (routeId: string) => void;
}

const ROUTE_OPTIONS = [
  { id: 'all',     label: 'Todas las rutas' },
  { id: 'route-1', label: 'Ruta 1 — Centro/Hospital' },
  { id: 'route-3', label: 'Ruta 3 — Amanecer/Costanera' },
];

export function RouteFilter({ buses, value, onChange }: RouteFilterProps) {
  const countFor = (routeId: string) =>
    routeId === 'all' ? buses.length : buses.filter((b) => b.routeId === routeId).length;

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      {ROUTE_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        const count = countFor(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '9999px',
              border: isActive
                ? '1px solid hsl(215,80%,55%)'
                : '1px solid rgba(255,255,255,0.12)',
              background: isActive
                ? 'hsla(215,80%,55%,0.18)'
                : 'rgba(255,255,255,0.04)',
              color: isActive ? 'hsl(215,100%,80%)' : '#94a3b8',
              fontSize: '12px',
              fontWeight: isActive ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '9999px',
              background: isActive ? 'hsla(215,80%,55%,0.35)' : 'rgba(255,255,255,0.08)',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
