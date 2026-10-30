import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { busOptionLabel, canDrive, routeOptionLabel } from '../../company/driverTrip';
import { useDriverTrip } from '../../hooks/useDriverTrip';
import { makeStyles, radius, spacing } from '../../theme';

export default function DriverModeScreen() {
  const { buses, routes, selectedBus, selectedRoute, selectBus, selectRoute, trip, busy, loading, error, actionError, start, stop, refresh } =
    useDriverTrip();
  const styles = useStyles();
  const canStart = !!selectedBus && !!selectedRoute && !busy;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Modo conductor</Text>
        <Text style={styles.subtitle}>{trip ? 'Recorrido activo' : 'Elige una micro y una ruta para comenzar'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {actionError ? <Text style={styles.error} accessibilityRole="alert">{actionError}</Text> : null}
        {loading && buses.length === 0 ? <Text style={styles.detail}>Cargando flota…</Text> : null}
        {!loading && buses.length === 0 ? <Text style={styles.empty}>No hay micros asignadas a esta empresa.</Text> : null}
        {!trip ? (
          <>
            <Text style={styles.section}>Micro</Text>
            {buses.map((bus) => (
              <Choice key={bus.id} label={busOptionLabel(bus)} selected={selectedBus?.id === bus.id} disabled={!canDrive(bus)} onPress={() => selectBus(bus.id)} />
            ))}
            <Text style={styles.section}>Ruta</Text>
            {routes.map((route) => (
              <Choice key={route.id} label={routeOptionLabel(route)} selected={selectedRoute?.id === route.id} onPress={() => selectRoute(route.id)} />
            ))}
            <Pressable disabled={!canStart} onPress={() => void start()} style={[styles.action, !canStart && styles.disabled]}>
              <Text style={styles.actionText}>{busy ? 'Actualizando…' : 'Iniciar recorrido'}</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>{trip.bus.patente} en servicio</Text>
            <Text style={styles.detail}>{routeOptionLabel(trip.route)}</Text>
            <Text style={styles.detail}>El estado de la micro ya se actualizó en el sistema.</Text>
            <Pressable disabled={busy} onPress={() => void stop()} style={[styles.action, styles.stopAction, busy && styles.disabled]}>
              <Text style={styles.actionText}>{busy ? 'Actualizando…' : 'Finalizar recorrido'}</Text>
            </Pressable>
          </View>
        )}
        {error ? (
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, disabled = false, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.sm },
  heading: { color: colors.text, fontSize: font(25), fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: font(14), marginBottom: spacing.md }, section: { color: colors.text, fontSize: font(16), fontWeight: '700', marginTop: spacing.md },
  choice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, choiceSelected: { borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: font(14) }, choiceTextSelected: { color: colors.accent, fontWeight: '700' }, action: { marginTop: spacing.lg, backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  stopAction: { backgroundColor: colors.danger }, actionText: { color: colors.onPrimary, fontSize: font(15), fontWeight: '700' }, disabled: { opacity: 0.55 }, activeCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm },
  activeTitle: { color: colors.text, fontWeight: '700', fontSize: font(18) }, detail: { color: colors.muted, fontSize: font(14) }, error: { color: colors.danger, fontSize: font(14) }, empty: { color: colors.muted, fontSize: font(14), paddingVertical: spacing.lg }, retry: { color: colors.accent, fontWeight: '700', paddingVertical: spacing.sm },
}));
