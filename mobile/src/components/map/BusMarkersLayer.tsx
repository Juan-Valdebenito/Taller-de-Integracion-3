import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { useAnimatedPosition } from '../../hooks/useAnimatedPosition';
import type { LiveBus } from '../../realtime/liveBuses';
import { busColor, busIconSize, RECENT_MS } from './busIcon';
import { ROUTE_LABELS, type RouteId } from './routeNodes';

export interface BusMarkersLayerProps {
  buses: readonly LiveBus[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** true si las micros vienen del WebSocket (para resaltar las recién actualizadas). */
  live?: boolean;
}

/** Texto para lectores de pantalla: "Micro Línea 7A, 45 % de ocupación". */
export function busAccessibilityLabel(bus: LiveBus): string {
  const line = ROUTE_LABELS[bus.routeId as RouteId] ?? bus.routeName;
  const pct = bus.capacity > 0 ? Math.round((bus.currentPassengers / bus.capacity) * 100) : 0;
  return `Micro ${line}, ${pct} % de ocupación`;
}

/**
 * Micros sobre el mapa, como BusMarker del web: se deslizan entre
 * actualizaciones y, al tocarlas, quedan seleccionadas (ícono más grande). La
 * versión web (Leaflet, con el SVG del web) está en BusMarkersLayer.web.tsx.
 */
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
  return (
    <Marker
      coordinate={{ latitude: position.latitude, longitude: position.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => onSelect?.(bus.id)}
      accessibilityLabel={busAccessibilityLabel(bus)}
      // El ícono cambia con el color y el rumbo: hay que volver a dibujarlo.
      tracksViewChanges
      zIndex={selected ? 2 : 1}
    >
      <BusIcon color={busColor(bus)} heading={position.heading} selected={selected} recent={recent} />
    </Marker>
  );
}

/** El ícono del web armado con Views (sin SVG): halo, cuerpo, flecha y 🚌. */
export function BusIcon({ color, heading, selected, recent }: { color: string; heading: number; selected: boolean; recent: boolean }) {
  const size = busIconSize(selected);
  const half = size / 2;
  const arrow = selected ? 6 : 5;
  const arrowTop = half - (selected ? 16 : 12);
  const circle = (diameter: number) => ({
    position: 'absolute' as const,
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    left: half - diameter / 2,
    top: half - diameter / 2,
  });
  return (
    <View style={{ width: size, height: size }} testID="bus-icon">
      {selected ? <View style={[circle(size - 4), { borderWidth: 2, borderColor: color, opacity: 0.3 }]} /> : null}
      {recent ? <View style={[circle(size - 8), { backgroundColor: color, opacity: 0.12 }]} /> : null}
      <View style={[circle(size - 6), { backgroundColor: color, opacity: 0.18 }]} />
      <View style={[circle(size - 14), { backgroundColor: color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)' }]} />
      {/* Flecha de dirección: triángulo arriba, girado según el rumbo. */}
      <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${heading}deg` }] }}>
        <View
          style={{
            position: 'absolute',
            top: arrowTop,
            left: half - arrow,
            width: 0,
            height: 0,
            borderLeftWidth: arrow,
            borderRightWidth: arrow,
            borderBottomWidth: arrow + 2,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: 'rgba(255,255,255,0.9)',
          }}
        />
      </View>
      <Text style={{ position: 'absolute', width: size, top: half - (selected ? 11 : 9), textAlign: 'center', fontSize: selected ? 16 : 13 }}>
        🚌
      </Text>
    </View>
  );
}
