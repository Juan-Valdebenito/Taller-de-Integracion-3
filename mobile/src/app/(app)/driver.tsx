import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import { updateCompanyBus } from '../../api/companyApi';
import { useAuth } from '../../auth/AuthContext';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

const canDrive = (role?: string) => role === 'COMPANY' || role === 'ADMIN';

export default function DriverModeScreen() {
  const { user } = useAuth();
  const { buses, routes, loading, error, refresh } = useCompanyOperations();
  const { colors } = useTheme();
  const styles = useStyles();
  const [busId, setBusId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [activeBusId, setActiveBusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const availableBuses = useMemo(() => buses.filter((bus) => bus.status === 'INACTIVE'), [buses]);
  const selectedBus = useMemo(() => availableBuses.find((bus) => bus.id === busId) ?? availableBuses[0], [availableBuses, busId]);
  const selectedRoute = useMemo(() => routes.find((route) => route.id === routeId) ?? routes.find((route) => route.isActive) ?? routes[0], [routes, routeId]);
  const activeBus = buses.find((bus) => bus.id === activeBusId);

  const startTrip = useCallback(async () => {
    if (!selectedBus || !selectedRoute || busy) return;
    setBusy(true);
    try {
      await updateCompanyBus(selectedBus.id, { status: 'ACTIVE', routeId: selectedRoute.id });
      setActiveBusId(selectedBus.id);
      await refresh();
    } catch (cause) {
      Alert.alert('No se pudo iniciar el recorrido', cause instanceof ApiError ? cause.message : 'Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, selectedBus, selectedRoute]);

  const stopTrip = useCallback(async () => {
    if (!activeBus || busy) return;
    setBusy(true);
    try {
      await updateCompanyBus(activeBus.id, { status: 'INACTIVE' });
      setActiveBusId(null);
      await refresh();
    } catch (cause) {
      Alert.alert('No se pudo finalizar el recorrido', cause instanceof ApiError ? cause.message : 'Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  }, [activeBus, busy, refresh]);

  if (!canDrive(user?.role)) return <Redirect href="/(app)" />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Modo conductor</Text>
        <Text style={styles.subtitle}>{activeBus ? 'Recorrido activo' : 'Elige una micro y una ruta para comenzar'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && buses.length === 0 ? <Text style={styles.detail}>Cargando flota…</Text> : null}
        {!loading && buses.length === 0 ? <Text style={styles.empty}>No hay micros asignadas a esta empresa.</Text> : null}
        {!activeBus ? <>
          <Text style={styles.section}>Micro disponible</Text>
          {availableBuses.map((bus) => (
            <Choice key={bus.id} label={`${bus.patente} · ${bus.currentPassengers}/${bus.capacity} pasajeros`} selected={selectedBus?.id === bus.id} onPress={() => setBusId(bus.id)} />
          ))}
          {availableBuses.length === 0 && buses.length > 0 ? <Text style={styles.empty}>No hay micros disponibles para iniciar un recorrido.</Text> : null}
          <Text style={styles.section}>Ruta</Text>
          {routes.filter((route) => route.isActive).map((route) => (
            <Choice key={route.id} label={`${route.code} · ${route.name}`} selected={selectedRoute?.id === route.id} onPress={() => setRouteId(route.id)} />
          ))}
          <Pressable disabled={!selectedBus || !selectedRoute || busy} onPress={() => void startTrip()} style={[styles.action, (!selectedBus || !selectedRoute || busy) && styles.disabled]}>
            <Text style={styles.actionText}>{busy ? 'Actualizando…' : 'Iniciar recorrido'}</Text>
          </Pressable>
        </> : <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>{activeBus.patente} en servicio</Text>
          <Text style={styles.detail}>{routes.find((route) => route.id === activeBus.routeId)?.name ?? 'Ruta asignada'}</Text>
          <Text style={styles.detail}>El estado de la micro ya se actualizó en el sistema.</Text>
          <Pressable disabled={busy} onPress={() => void stopTrip()} style={[styles.action, styles.stopAction, busy && styles.disabled]}>
            <Text style={styles.actionText}>{busy ? 'Actualizando…' : 'Finalizar recorrido'}</Text>
          </Pressable>
        </View>}
        {error ? <Pressable onPress={() => void refresh()}><Text style={styles.retry}>Reintentar</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

const useStyles = makeStyles((colors, font) => ({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.sm },
  heading: { color: colors.text, fontSize: font(25), fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: font(14), marginBottom: spacing.md }, section: { color: colors.text, fontSize: font(16), fontWeight: '700', marginTop: spacing.md },
  choice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, choiceSelected: { borderColor: colors.primary },
  choiceText: { color: colors.text, fontSize: font(14) }, choiceTextSelected: { color: colors.primary, fontWeight: '700' }, action: { marginTop: spacing.lg, backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  stopAction: { backgroundColor: colors.danger }, actionText: { color: colors.onPrimary, fontSize: font(15), fontWeight: '700' }, disabled: { opacity: 0.55 }, activeCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm },
  activeTitle: { color: colors.text, fontWeight: '700', fontSize: font(18) }, detail: { color: colors.muted, fontSize: font(14) }, error: { color: colors.danger, fontSize: font(14) }, empty: { color: colors.muted, fontSize: font(14), paddingVertical: spacing.lg }, retry: { color: colors.primary, fontWeight: '700', paddingVertical: spacing.sm },
}));
