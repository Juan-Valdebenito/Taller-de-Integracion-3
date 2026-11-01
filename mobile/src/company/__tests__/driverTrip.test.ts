import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { busOptionLabel, canDrive, defaultBus, defaultRoute, drivableRoutes, routeOptionLabel } from '../driverTrip';

const bus = (id: string, status: CompanyBus['status'], routeId: string | null = null): CompanyBus => ({
  id,
  patente: id.toUpperCase(),
  capacity: 35,
  currentPassengers: 0,
  status,
  companyId: 'co1',
  routeId,
});
const route = (id: string, isActive = true): CompanyRoute => ({ id, code: id.toUpperCase(), name: `Ruta ${id}`, isActive, companyId: 'co1' });

describe('reglas del modo conductor', () => {
  it('usa las palabras del web para cada estado', () => {
    expect(busOptionLabel(bus('bgpk45', 'INACTIVE'))).toBe('BGPK45 · Disponible');
    expect(busOptionLabel(bus('crtm12', 'ACTIVE'))).toBe('CRTM12 · En servicio');
    expect(busOptionLabel(bus('fgrt33', 'MAINTENANCE'))).toBe('FGRT33 · Mantenimiento');
    expect(routeOptionLabel({ code: '7A', name: 'Cajón / Santa Rosa' })).toBe('Línea 7A · Cajón / Santa Rosa');
  });

  it('como el web, una micro en mantenimiento o fuera de servicio no puede salir', () => {
    expect(canDrive(bus('a', 'INACTIVE'))).toBe(true);
    expect(canDrive(bus('a', 'ACTIVE'))).toBe(true);
    expect(canDrive(bus('a', 'MAINTENANCE'))).toBe(false);
    expect(canDrive(bus('a', 'OUT_OF_SERVICE'))).toBe(false);
  });

  it('por defecto elige la primera disponible, o respeta la elegida si puede salir', () => {
    const buses = [bus('m', 'MAINTENANCE'), bus('s', 'ACTIVE'), bus('d', 'INACTIVE')];
    expect(defaultBus(buses, null)?.id).toBe('d');
    expect(defaultBus(buses, 's')?.id).toBe('s');
    expect(defaultBus(buses, 'm')?.id).toBe('d'); // en mantenimiento: no se puede elegir
    expect(defaultBus([bus('s', 'ACTIVE')], null)?.id).toBe('s');
    expect(defaultBus([bus('m', 'MAINTENANCE')], null)).toBeNull();
  });

  it('solo se recorren rutas activas; por defecto la elegida, la de la micro o la primera', () => {
    const routes = [route('r1'), route('r2'), route('off', false)];
    expect(drivableRoutes(routes).map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(defaultRoute(routes, 'r2', null)?.id).toBe('r2');
    expect(defaultRoute(routes, null, bus('a', 'INACTIVE', 'r2'))?.id).toBe('r2');
    expect(defaultRoute(routes, 'off', null)?.id).toBe('r1');
    expect(defaultRoute([route('off', false)], null, null)).toBeNull();
  });
});
