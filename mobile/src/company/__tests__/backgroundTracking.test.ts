import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { apiRequest } from '../../api/client';
import {
  DRIVER_LOCATION_TASK,
  handleLocations,
  startBackgroundTracking,
  stopBackgroundTracking,
  toGpsReport,
} from '../backgroundTracking';

jest.mock('../../api/client', () => ({ apiRequest: jest.fn(async () => ({ live: true, telemetry: true })) }));

const location = Location as unknown as typeof Location & {
  __permission: (s: 'granted' | 'denied') => unknown;
  __location: (lat: number, lng: number, acc?: number | null, ts?: number) => Location.LocationObject;
};
const taskManager = TaskManager as unknown as typeof TaskManager & { __tasks: Map<string, (body: unknown) => Promise<void>> };
const trip = { busId: 'bus-1', routeId: 'route-1' };

function setAppState(state: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setAppState('background');
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(location.__permission('granted') as never);
  jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue(location.__permission('granted') as never);
  jest.mocked(TaskManager.isAvailableAsync).mockResolvedValue(true);
});

it('define la tarea al cargar el módulo (ámbito global)', () => {
  expect(taskManager.__tasks.has(DRIVER_LOCATION_TASK)).toBe(true);
});

it('convierte la posición del sistema: m/s a km/h y rumbo desconocido a 0', () => {
  const loc = { coords: { latitude: -38.7, longitude: -72.6, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: 89.6, speed: 10 }, timestamp: Date.UTC(2026, 10, 1, 12) };
  expect(toGpsReport(trip, loc)).toEqual({ busId: 'bus-1', routeId: 'route-1', latitude: -38.7, longitude: -72.6, heading: 90, speed: 36, timestamp: '2026-11-01T12:00:00.000Z' });
  expect(toGpsReport(trip, { ...loc, coords: { ...loc.coords, heading: -1, speed: -1 } })).toMatchObject({ heading: 0, speed: 0 });
});

it('al iniciar pide el permiso "siempre", guarda el recorrido y arranca el servicio con su notificación', async () => {
  await expect(startBackgroundTracking(trip)).resolves.toBe('active');

  expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
  expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
    DRIVER_LOCATION_TASK,
    expect.objectContaining({
      timeInterval: 10_000,
      foregroundService: expect.objectContaining({ notificationTitle: 'Recorrido en curso', killServiceOnDestroy: true }),
    }),
  );
  expect(JSON.parse((await AsyncStorage.getItem('transithub.backgroundTrip'))!)).toEqual(trip);
});

it('sin el permiso "siempre" o en Expo Go no arranca, y lo dice', async () => {
  jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValueOnce(location.__permission('denied') as never);
  await expect(startBackgroundTracking(trip)).resolves.toBe('denied');

  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(location.__permission('denied') as never);
  await expect(startBackgroundTracking(trip)).resolves.toBe('denied');

  jest.mocked(TaskManager.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(startBackgroundTracking(trip)).resolves.toBe('unavailable');

  jest.mocked(Location.startLocationUpdatesAsync).mockRejectedValueOnce(new Error('Foreground services are not available in Expo Go'));
  await expect(startBackgroundTracking(trip)).resolves.toBe('unavailable');
  expect(await AsyncStorage.getItem('transithub.backgroundTrip')).toBeNull();
});

it('en segundo plano envía la posición más reciente; con la app abierta no (ya va por el WebSocket)', async () => {
  await startBackgroundTracking(trip);
  const older = location.__location(-38.70, -72.60, 5, 1_000);
  const newer = location.__location(-38.71, -72.61, 5, 2_000);

  await taskManager.__tasks.get(DRIVER_LOCATION_TASK)!({ data: { locations: [newer, older] }, error: null, executionInfo: { eventId: '1', taskName: DRIVER_LOCATION_TASK } });
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledWith('/telemetry/gps', { method: 'POST', body: expect.objectContaining({ busId: 'bus-1', routeId: 'route-1', latitude: -38.71, longitude: -72.61 }) });

  setAppState('active');
  await handleLocations([newer]);
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

it('sin recorrido guardado, con error del sistema o sin conexión no hace nada (ni falla)', async () => {
  await handleLocations([location.__location(-38.7, -72.6)]);
  expect(apiRequest).not.toHaveBeenCalled();

  await startBackgroundTracking(trip);
  await taskManager.__tasks.get(DRIVER_LOCATION_TASK)!({ data: null, error: { code: '1', message: 'sin GPS' }, executionInfo: { eventId: '2', taskName: DRIVER_LOCATION_TASK } });
  expect(apiRequest).not.toHaveBeenCalled();

  jest.mocked(apiRequest).mockRejectedValueOnce(new Error('sin conexión'));
  await expect(handleLocations([location.__location(-38.7, -72.6)])).resolves.toBeUndefined();
});

it('al terminar detiene el servicio y olvida el recorrido', async () => {
  await startBackgroundTracking(trip);
  jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValueOnce(true);

  await stopBackgroundTracking();

  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(DRIVER_LOCATION_TASK);
  expect(await AsyncStorage.getItem('transithub.backgroundTrip')).toBeNull();
});
