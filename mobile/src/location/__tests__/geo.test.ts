import { checkStopProximity, distanceInMeters, findNearestStop, formatDistance, isValidCoordinates, type Stop } from '../geo';

// Plaza de Armas de Temuco
const PLAZA = { latitude: -38.7359, longitude: -72.5904 };
// 0,001° de latitud ≈ 111,2 m
const metersNorth = (meters: number) => ({ latitude: PLAZA.latitude + meters / 111_195, longitude: PLAZA.longitude });

const stop = (id: string, coords: { latitude: number; longitude: number }): Stop => ({ id, name: `Paradero ${id}`, ...coords });
const options = { radiusMeters: 100, maxAccuracyMeters: 100 };

describe('distanceInMeters (Haversine)', () => {
  it('distancia cero para el mismo punto', () => {
    expect(distanceInMeters(PLAZA, PLAZA)).toBe(0);
  });

  it('1° de latitud en el ecuador ≈ 111,195 km', () => {
    expect(distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -1);
  });

  it('0,001° de latitud en Temuco ≈ 111 m', () => {
    expect(distanceInMeters(PLAZA, { latitude: PLAZA.latitude + 0.001, longitude: PLAZA.longitude })).toBeCloseTo(111.2, 0);
  });

  it('un grado de longitud mide menos lejos del ecuador (cos de la latitud)', () => {
    const east = distanceInMeters(PLAZA, { latitude: PLAZA.latitude, longitude: PLAZA.longitude + 0.001 });
    expect(east).toBeCloseTo(111.195 * Math.cos((38.7359 * Math.PI) / 180), 0);
  });

  it('es simétrica', () => {
    const a = metersNorth(250);
    expect(distanceInMeters(PLAZA, a)).toBeCloseTo(distanceInMeters(a, PLAZA), 6);
  });
});

describe('findNearestStop', () => {
  it('elige el paradero más cercano', () => {
    const nearest = findNearestStop(PLAZA, [stop('lejos', metersNorth(400)), stop('cerca', metersNorth(60)), stop('medio', metersNorth(200))]);
    expect(nearest?.stop.id).toBe('cerca');
    expect(nearest?.distanceMeters).toBeCloseTo(60, 0);
  });

  it('ignora paraderos con coordenadas inválidas o (0,0)', () => {
    const nearest = findNearestStop(PLAZA, [stop('sin-datos', { latitude: 0, longitude: 0 }), stop('valido', metersNorth(500))]);
    expect(nearest?.stop.id).toBe('valido');
  });

  it('null sin paraderos', () => {
    expect(findNearestStop(PLAZA, [])).toBeNull();
  });
});

describe('checkStopProximity', () => {
  it('dentro del radio', () => {
    const result = checkStopProximity({ ...PLAZA, accuracy: 15 }, [stop('a', metersNorth(80))], options);
    expect(result.status).toBe('inside');
    expect(result.nearest?.stop.id).toBe('a');
  });

  it('justo en el borde del radio cuenta como dentro', () => {
    expect(checkStopProximity(PLAZA, [stop('a', metersNorth(99.9))], options).status).toBe('inside');
  });

  it('fuera del radio informa el más cercano', () => {
    const result = checkStopProximity({ ...PLAZA, accuracy: 10 }, [stop('a', metersNorth(320))], options);
    expect(result.status).toBe('outside');
    expect(result.nearest?.distanceMeters).toBeCloseTo(320, 0);
  });

  it('sin paraderos en la zona', () => {
    expect(checkStopProximity(PLAZA, [], options)).toEqual({ status: 'no-stops', nearest: null, radiusMeters: 100 });
  });

  it('no confirma la cercanía si el GPS es demasiado impreciso', () => {
    const result = checkStopProximity({ ...PLAZA, accuracy: 350 }, [stop('a', metersNorth(20))], options);
    expect(result.status).toBe('low-accuracy');
    expect(result.nearest?.stop.id).toBe('a');
  });

  it('sin dato de precisión se usa la distancia', () => {
    expect(checkStopProximity({ ...PLAZA, accuracy: null }, [stop('a', metersNorth(50))], options).status).toBe('inside');
  });

  it('respeta un radio configurado distinto', () => {
    const stops = [stop('a', metersNorth(150))];
    expect(checkStopProximity(PLAZA, stops, { ...options, radiusMeters: 100 }).status).toBe('outside');
    expect(checkStopProximity(PLAZA, stops, { ...options, radiusMeters: 200 }).status).toBe('inside');
  });
});

describe('isValidCoordinates', () => {
  it.each([
    [{ latitude: -38.7, longitude: -72.6 }, true],
    [{ latitude: 0, longitude: 0 }, false],
    [{ latitude: 91, longitude: 0 }, false],
    [{ latitude: 10, longitude: 181 }, false],
    [{ latitude: Number.NaN, longitude: 1 }, false],
  ])('%p → %p', (coords, expected) => {
    expect(isValidCoordinates(coords)).toBe(expected);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [84.6, '85 m'],
    [999.4, '999 m'],
    [1200, '1,2 km'],
  ])('%p → %p', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});
