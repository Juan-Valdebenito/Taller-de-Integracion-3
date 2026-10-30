import { Pressable, ScrollView, Text, View } from 'react-native';

import type { LiveBus } from '../../realtime/liveBuses';
import { makeStyles, radius } from '../../theme';
import { ROUTE_LABELS, type RouteFilterValue, type RouteId } from './routeNodes';

/** Opciones del filtro, en el orden del web. */
export const ROUTE_OPTIONS: readonly { id: RouteFilterValue; label: string }[] = [
  { id: 'all', label: 'Todas las rutas' },
  ...(Object.keys(ROUTE_LABELS) as RouteId[]).map((id) => ({ id, label: ROUTE_LABELS[id] })),
];

/** Micros de una opción del filtro ('all' cuenta todas). */
export const countForRoute = (buses: readonly LiveBus[], id: RouteFilterValue) =>
  id === 'all' ? buses.length : buses.filter((bus) => bus.routeId === id).length;

/** Micros que se ven con el filtro elegido (misma lógica que PassengerMapPage del web). */
export const filterBusesByRoute = (buses: readonly LiveBus[], filter: RouteFilterValue): readonly LiveBus[] =>
  filter === 'all' ? buses : buses.filter((bus) => bus.routeId === filter);

export interface RouteFilterProps {
  buses: readonly LiveBus[];
  value: RouteFilterValue;
  onChange: (value: RouteFilterValue) => void;
}

/**
 * Barra "Ruta:" con una píldora por línea y su cantidad de micros, como
 * RouteFilter del web. En el teléfono se desliza de lado si no cabe.
 */
export function RouteFilter({ buses, value, onChange }: RouteFilterProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Text style={styles.label}>Ruta:</Text>
        {ROUTE_OPTIONS.map((option) => {
          const active = option.id === value;
          const count = countForRoute(buses, option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${option.label}, ${count} micros`}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.chipTextActive]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Medidas y colores del web: barra sobre hsl(220, 20%, 10%), activo hsl(215, 80%, 55%).
const useStyles = makeStyles((_colors, font) => ({
  bar: { backgroundColor: '#14171f', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  row: { alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16 },
  label: { fontSize: font(12), fontWeight: '600', color: '#64748b', marginRight: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipActive: { borderColor: '#307de8', backgroundColor: 'rgba(48, 125, 232, 0.18)' },
  chipText: { fontSize: font(12), fontWeight: '400', color: '#94a3b8' },
  chipTextActive: { fontWeight: '700', color: '#99c4ff' }, // hsl(215, 100%, 80%)
  count: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  countActive: { backgroundColor: 'rgba(48, 125, 232, 0.35)' },
  countText: { fontSize: font(10), fontWeight: '700', color: '#94a3b8' },
}));
