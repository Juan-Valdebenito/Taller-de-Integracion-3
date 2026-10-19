import { formatLongDate, initials, roleLabel } from '../format';

describe('initials', () => {
  it.each([
    ['Ana María Pérez', 'AP'],
    ['ana', 'A'],
    ['  juan   pablo  ', 'JP'],
    ['', '?'],
    [undefined, '?'],
  ])('%p → %p', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('formatLongDate', () => {
  it('formatea en español', () => {
    expect(formatLongDate('2026-03-05T12:00:00')).toBe('5 de marzo de 2026');
  });

  it('devuelve vacío si la fecha falta o no es válida', () => {
    expect(formatLongDate(undefined)).toBe('');
    expect(formatLongDate('no-es-fecha')).toBe('');
  });
});

describe('roleLabel', () => {
  it('traduce los roles de backend-go', () => {
    expect(roleLabel('PASSENGER')).toBe('Pasajero');
    expect(roleLabel('COMPANY')).toBe('Empresa');
    expect(roleLabel('ADMIN')).toBe('Administrador');
  });

  it('deja tal cual un rol desconocido', () => {
    expect(roleLabel('OTRO')).toBe('OTRO');
  });
});
