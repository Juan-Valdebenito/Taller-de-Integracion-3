/**
 * Panel de reclamos del administrador (funciones puras), con los textos e
 * íconos de AdminComplaintsView del web.
 */

/** Nombre e ícono de cada categoría en el panel del administrador (CATEGORY_CONFIG del web). */
export const ADMIN_CATEGORY: Readonly<Record<string, { label: string; icon: string }>> = {
  OVERCROWDING: { label: 'Sobrecupo / Aforo', icon: '⚠️' },
  DELAY: { label: 'Frecuencia / Retraso', icon: '⏱️' },
  DRIVER_BEHAVIOR: { label: 'Conducta Chofer', icon: '🛑' },
  FARES_PAYMENT: { label: 'Pago Tarifa / Bipay', icon: '💳' },
  VEHICLE_CONDITION: { label: 'Estado Vehículo', icon: '🧹' },
  ACCESSIBILITY: { label: 'Accesibilidad', icon: '♿' },
  OTHER: { label: 'Otro Incidente', icon: 'ℹ️' },
};

export const adminCategory = (key: string) => ADMIN_CATEGORY[key] ?? { label: key, icon: '📌' };

export interface BreakdownRow {
  key: string;
  count: number;
  /** Porcentaje del total de la distribución (0 a 100, redondeado). */
  percent: number;
}

/** Filas de una distribución ordenadas de mayor a menor (empate: por nombre). */
export function breakdown(counts: Readonly<Record<string, number>>): BreakdownRow[] {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([key, count]) => ({ key, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 }));
}

/** "4.2" con un decimal, como el web. */
export const formatRating = (rating: number) => rating.toFixed(1);
export const formatPercent = (percent: number) => `${percent.toFixed(1)}%`;

/** Estrellas llenas: el promedio redondeado (como el web). */
export const filledStars = (rating: number) => Math.max(0, Math.min(5, Math.round(rating)));
