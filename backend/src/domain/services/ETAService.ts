import { GeoLocation } from '../entities/Bus';
import { Stop } from '../entities/Route';

/**
 * Coordenadas geográficas genéricas para el cálculo de distancias.
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Resultado del cálculo de ETA.
 */
export interface ETAResult {
  distanceKm: number;   // Distancia en kilómetros
  etaMinutes: number;   // Tiempo estimado en minutos (Infinity si bus parado)
  etaText: string;      // Texto legible: "2 min", "1 h 5 min", "Bus parado"
  speedKmh: number;     // Velocidad usada en el cálculo
}

/**
 * Velocidad por defecto cuando el bus no reporta velocidad (km/h).
 */
export const DEFAULT_BUS_SPEED_KMH = 30;

/**
 * Servicio de dominio: Cálculo de ETA (Estimated Time of Arrival).
 *
 * Calcula el tiempo estimado de llegada de una micro a una parada
 * usando la fórmula de Haversine para la distancia entre coordenadas.
 *
 * @remarks
 * Este servicio es puramente funcional (sin efectos secundarios ni BD).
 * Se puede usar desde un use-case, un endpoint REST o un evento Socket.IO.
 */
export class ETAService {
  private static readonly EARTH_RADIUS_KM = 6371;

  /**
   * Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine.
   *
   * @param from - Coordenadas origen
   * @param to   - Coordenadas destino
   * @returns Distancia en kilómetros
   */
  static calculateDistance(from: Coordinates, to: Coordinates): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(to.latitude - from.latitude);
    const dLon = toRad(to.longitude - from.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(from.latitude)) *
        Math.cos(toRad(to.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return ETAService.EARTH_RADIUS_KM * c;
  }

  /**
   * Formatea los minutos de ETA en un texto legible.
   *
   * @param minutes - Minutos de ETA
   * @returns Texto legible ("2 min", "1 h 5 min", "Bus parado", "Llegando ahora")
   */
  static formatETA(minutes: number): string {
    if (!isFinite(minutes)) return 'Bus parado';
    if (minutes < 1) return 'Llegando ahora';

    const roundedMinutes = Math.round(minutes);

    if (roundedMinutes < 60) {
      return `${roundedMinutes} min`;
    }

    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;

    if (remainingMinutes === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${remainingMinutes} min`;
  }

  /**
   * Calcula el ETA desde una ubicación origen hasta unas coordenadas destino.
   *
   * @param from      - Coordenadas del bus (origen)
   * @param to        - Coordenadas de la parada (destino)
   * @param speedKmh  - Velocidad del bus en km/h (opcional; usa DEFAULT_BUS_SPEED_KMH si no se provee; Infinity si es 0)
   * @returns ETAResult con distancia, minutos, texto y velocidad usada
   */
  static calculateETA(
    from: Coordinates,
    to: Coordinates,
    speedKmh?: number,
  ): ETAResult {
    const distanceKm = ETAService.calculateDistance(from, to);

    // Si el bus está parado (speed = 0) → ETA infinito
    // Si no se provee velocidad → usar velocidad por defecto
    const effectiveSpeed =
      speedKmh !== undefined && speedKmh > 0
        ? speedKmh
        : speedKmh === 0
          ? 0
          : DEFAULT_BUS_SPEED_KMH;

    const etaMinutes =
      effectiveSpeed === 0 ? Infinity : (distanceKm / effectiveSpeed) * 60;

    return {
      distanceKm: Math.round(distanceKm * 1000) / 1000, // 3 decimales
      etaMinutes,
      etaText: ETAService.formatETA(etaMinutes),
      speedKmh: effectiveSpeed,
    };
  }

  /**
   * Wrapper de alto nivel: calcula el ETA usando directamente
   * la entidad GeoLocation del Bus y una parada (Stop) de la ruta.
   *
   * @param busLocation - Ubicación actual del bus (de la entidad Bus)
   * @param stop        - Parada destino (de la entidad Route)
   * @returns ETAResult
   */
  static getETAToStop(busLocation: GeoLocation, stop: Stop): ETAResult {
    return ETAService.calculateETA(
      {
        latitude: busLocation.latitude,
        longitude: busLocation.longitude,
      },
      {
        latitude: stop.latitude,
        longitude: stop.longitude,
      },
      busLocation.speed,
    );
  }
}
