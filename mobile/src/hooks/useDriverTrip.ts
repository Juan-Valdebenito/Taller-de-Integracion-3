import { useCallback, useMemo, useRef, useState } from 'react';

import { updateCompanyBus, type CompanyBus, type CompanyRoute } from '../api/companyApi';
import { ApiError } from '../api/errors';
import { defaultBus, defaultRoute, drivableRoutes } from '../company/driverTrip';
import { useCompanyOperations } from './useCompanyOperations';

export interface ActiveTrip {
  bus: CompanyBus;
  route: CompanyRoute;
  /** Inicio del recorrido (ms desde 1970). */
  startedAt: number;
}

export interface UseDriverTripResult {
  /** Todas las micros de la empresa (las que no pueden salir se muestran deshabilitadas, como el web). */
  buses: CompanyBus[];
  /** Rutas activas de la empresa. */
  routes: CompanyRoute[];
  selectedBus: CompanyBus | null;
  selectedRoute: CompanyRoute | null;
  selectBus: (id: string) => void;
  selectRoute: (id: string) => void;
  trip: ActiveTrip | null;
  /** Iniciando o finalizando (botones deshabilitados). */
  busy: boolean;
  loading: boolean;
  /** Error al cargar micros y rutas. */
  error: string | null;
  /** Error al iniciar o finalizar, para mostrarlo en la tarjeta. */
  actionError: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Recorrido del modo conductor: elegir micro y ruta, iniciar (la micro pasa a
 * ACTIVE con esa ruta en backend-go) y finalizar (vuelve a INACTIVE). Antes la
 * lógica estaba dentro de la pantalla.
 */
export function useDriverTrip(now: () => number = Date.now): UseDriverTripResult {
  const { buses, routes, loading, error, refresh } = useCompanyOperations();
  const [chosenBusId, setChosenBusId] = useState<string | null>(null);
  const [chosenRouteId, setChosenRouteId] = useState<string | null>(null);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Candado: un doble toque no envía dos solicitudes.
  const inFlight = useRef(false);

  const selectedBus = useMemo(() => defaultBus(buses, chosenBusId), [buses, chosenBusId]);
  const selectedRoute = useMemo(() => defaultRoute(routes, chosenRouteId, selectedBus), [routes, chosenRouteId, selectedBus]);
  const activeRoutes = useMemo(() => drivableRoutes(routes), [routes]);

  const run = useCallback(async (action: () => Promise<void>, failure: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (cause) {
      setActionError(`${failure}: ${cause instanceof ApiError ? cause.message : 'inténtalo nuevamente.'}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const start = useCallback(
    () =>
      run(async () => {
        if (!selectedBus || !selectedRoute) return;
        const updated = await updateCompanyBus(selectedBus.id, { status: 'ACTIVE', routeId: selectedRoute.id });
        setTrip({ bus: { ...selectedBus, ...updated, status: 'ACTIVE', routeId: selectedRoute.id }, route: selectedRoute, startedAt: now() });
        await refresh();
      }, 'No se pudo iniciar el recorrido'),
    [run, selectedBus, selectedRoute, refresh, now],
  );

  const stop = useCallback(
    () =>
      run(async () => {
        if (!trip) return;
        await updateCompanyBus(trip.bus.id, { status: 'INACTIVE' });
        setTrip(null);
        await refresh();
      }, 'No se pudo finalizar el recorrido'),
    [run, trip, refresh],
  );

  return {
    buses,
    routes: activeRoutes,
    selectedBus,
    selectedRoute,
    selectBus: setChosenBusId,
    selectRoute: setChosenRouteId,
    trip,
    busy,
    loading,
    error,
    actionError,
    start,
    stop,
    refresh,
  };
}
