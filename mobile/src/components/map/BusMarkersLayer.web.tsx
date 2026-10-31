import L from 'leaflet';
import { useMemo } from 'react';
import { Marker } from 'react-leaflet';

import { useAnimatedPosition } from '../../hooks/useAnimatedPosition';
import type { LiveBus } from '../../realtime/liveBuses';
import { busColor, busIconSize, busIconSvg, RECENT_MS } from './busIcon';
// Solo tipos desde './BusMarkersLayer': en web esa ruta es este mismo archivo.
import type { BusMarkersLayerProps } from './BusMarkersLayer';

/** Versión web de BusMarkersLayer: el mismo divIcon SVG que el frontend (Leaflet). */
export function BusMarkersLayer({ buses, selectedId = null, onSelect, live = false }: BusMarkersLayerProps) {
  return (
    <>
      {buses.map((bus) => (
        <BusMarker
          key={bus.id}
          bus={bus}
          selected={bus.id === selectedId}
          recent={live && Date.now() - bus.lastUpdate < RECENT_MS}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function BusMarker({ bus, selected, recent, onSelect }: { bus: LiveBus; selected: boolean; recent: boolean; onSelect?: (id: string) => void }) {
  const position = useAnimatedPosition(bus.latitude, bus.longitude, bus.heading);
  const color = busColor(bus);
  const icon = useMemo(() => {
    const size = busIconSize(selected);
    return L.divIcon({
      html: busIconSvg(color, bus.heading, selected, recent),
      className: 'bus-marker-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2 + 4)],
    });
  }, [color, bus.heading, selected, recent]);

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: () => onSelect?.(bus.id) }}
    />
  );
}
