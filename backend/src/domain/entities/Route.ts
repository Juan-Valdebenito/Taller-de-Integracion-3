/**
 * Parada de una ruta de transporte.
 */
export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number; // Orden dentro de la ruta
}

/**
 * Entidad de dominio: Ruta (Línea de micro)
 * Representa una línea de transporte público con sus paradas.
 */
export class Route {
  constructor(
    public readonly id: string,
    public name: string,            // Ej: "Línea 1 - Centro → Terminal"
    public code: string,            // Ej: "L1"
    public description: string,
    public stops: Stop[],
    public companyId: string,       // Empresa que opera la ruta
    public isActive: boolean,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Obtiene las paradas ordenadas por su posición en la ruta.
   */
  getOrderedStops(): Stop[] {
    return [...this.stops].sort((a, b) => a.order - b.order);
  }

  getFirstStop(): Stop | undefined {
    return this.getOrderedStops()[0];
  }

  getLastStop(): Stop | undefined {
    const ordered = this.getOrderedStops();
    return ordered[ordered.length - 1];
  }
}
