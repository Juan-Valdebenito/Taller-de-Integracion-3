import { canManage, closesComplaint, initialTarget, RESOLUTION_OPTIONS, validateResolution } from '../complaintResolution';

it('solo se gestionan los reclamos pendientes o en revisión', () => {
  expect(canManage('PENDING')).toBe(true);
  expect(canManage('IN_REVIEW')).toBe(true);
  expect(canManage('RESOLVED')).toBe(false);
  expect(canManage('REJECTED')).toBe(false);
});

it('como el web, un pendiente se abre en "En Revisión"', () => {
  expect(initialTarget('PENDING')).toBe('IN_REVIEW');
  expect(initialTarget('IN_REVIEW')).toBe('IN_REVIEW');
  expect(RESOLUTION_OPTIONS.map((o) => o.label)).toEqual(['🔍 En Revisión', '✅ Resolver', '❌ Rechazar']);
});

it('resolver o rechazar se confirma; seguir en revisión no', () => {
  expect(closesComplaint('IN_REVIEW', 'RESOLVED')).toBe(true);
  expect(closesComplaint('PENDING', 'REJECTED')).toBe(true);
  expect(closesComplaint('PENDING', 'IN_REVIEW')).toBe(false);
  expect(closesComplaint('IN_REVIEW', 'IN_REVIEW')).toBe(false);
});

it('pide una respuesta para el pasajero', () => {
  expect(validateResolution('   ')).toBe('Escribe una respuesta para el pasajero.');
  expect(validateResolution('Reforzamos la frecuencia')).toBeNull();
});
