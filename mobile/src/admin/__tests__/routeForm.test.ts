import type { CompanyRoute } from '../../api/companyApi';
import { formFromRoute, newRouteForm, toNewRouteInput, toRouteUpdateInput, validateRouteForm } from '../routeForm';

const routes: CompanyRoute[] = [
  { id: 'r1', code: '7A', name: 'Cajón / Santa Rosa', description: 'Pasa por el centro', isActive: true, companyId: 'co1' },
  { id: 'r2', code: '1C', name: 'Labranza / Centro', description: null, isActive: false, companyId: 'co2' },
];

const valid = { ...newRouteForm('co1'), code: '10B', name: 'Pedro de Valdivia' };

describe('validateRouteForm', () => {
  it('acepta una ruta completa', () => {
    expect(validateRouteForm(valid, routes, null)).toBeNull();
  });

  it('pide código, nombre y empresa', () => {
    expect(validateRouteForm({ ...valid, code: '  ' }, routes, null)).toBe('El código de la ruta es obligatorio');
    expect(validateRouteForm({ ...valid, code: 'X'.repeat(21) }, routes, null)).toBe('El código no puede superar 20 caracteres');
    expect(validateRouteForm({ ...valid, name: '' }, routes, null)).toBe('El nombre de la ruta es obligatorio');
    expect(validateRouteForm({ ...valid, companyId: '' }, routes, null)).toBe('Elige la empresa que opera la ruta');
  });

  it('no deja repetir un código (sin importar mayúsculas ni espacios), salvo el de la misma ruta', () => {
    expect(validateRouteForm({ ...valid, code: ' 7a ' }, routes, null)).toBe('Ya existe una ruta con el código 7a');
    expect(validateRouteForm({ ...formFromRoute(routes[0]), name: 'Otro nombre' }, routes, 'r1')).toBeNull();
    expect(validateRouteForm({ ...formFromRoute(routes[0]), code: '1C' }, routes, 'r1')).toBe('Ya existe una ruta con el código 1C');
  });
});

describe('datos para backend-go', () => {
  it('al crear manda empresa y sin estado; la descripción vacía va como null', () => {
    expect(toNewRouteInput({ ...valid, code: ' 10B ', name: ' Pedro de Valdivia ', description: '  ' })).toEqual({
      code: '10B',
      name: 'Pedro de Valdivia',
      description: null,
      companyId: 'co1',
    });
  });

  it('al editar manda el estado y no la empresa', () => {
    expect(toRouteUpdateInput({ ...formFromRoute(routes[0]), isActive: false })).toEqual({
      code: '7A',
      name: 'Cajón / Santa Rosa',
      description: 'Pasa por el centro',
      isActive: false,
    });
  });

  it('formFromRoute deja la descripción nula como texto vacío', () => {
    expect(formFromRoute(routes[1])).toEqual({ code: '1C', name: 'Labranza / Centro', companyId: 'co2', description: '', isActive: false });
  });
});
