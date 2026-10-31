/**
 * Empresas de transporte en el panel del administrador (funciones puras).
 * El web (AdminCompaniesPage) muestra empresas de ejemplo con sus micros,
 * rutas y reclamos inventados; aquí se calculan con los datos de backend-go.
 */
import type { CompanySummary } from '../api/adminApi';
import type { CompanyBus, CompanyRoute } from '../api/companyApi';

export interface CompanyCard extends CompanySummary {
  buses: number;
  /** Micros de la empresa en estado ACTIVE. */
  activeBuses: number;
  routes: number;
  pendingComplaints: number;
}

export function buildCompanyCards(
  companies: readonly CompanySummary[],
  buses: readonly CompanyBus[],
  routes: readonly CompanyRoute[],
  pendingByCompany: Readonly<Record<string, number>>,
): CompanyCard[] {
  return companies.map((company) => {
    const own = buses.filter((bus) => bus.companyId === company.id);
    return {
      ...company,
      buses: own.length,
      activeBuses: own.filter((bus) => bus.status === 'ACTIVE').length,
      routes: routes.filter((route) => route.companyId === company.id).length,
      pendingComplaints: pendingByCompany[company.id] ?? 0,
    };
  });
}

export type CompanyStatusFilter = 'ALL' | 'active' | 'inactive';

/** Opciones del filtro de estado, con los textos del web. */
export const COMPANY_STATUS_OPTIONS: readonly { value: CompanyStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

/** Busca por nombre, RUT o correo (como el web), sin importar mayúsculas ni tildes, y filtra por estado. */
export function filterCompanies(cards: readonly CompanyCard[], search: string, status: CompanyStatusFilter): CompanyCard[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = normalize(search.trim());
  return cards.filter((card) => {
    if (status === 'active' && !card.isActive) return false;
    if (status === 'inactive' && card.isActive) return false;
    if (!term) return true;
    const rutDigits = card.rut.replace(/[.\-]/g, '').toLowerCase();
    return [card.name, card.email, card.rut, card.id].some((field) => normalize(field).includes(term)) || (rutDigits !== '' && rutDigits.includes(term.replace(/[.\-]/g, '')));
  });
}
