import { notificationTarget } from '../useNotificationNavigation';

it('el aviso de un reclamo abre Reclamos solo para el pasajero', () => {
  expect(notificationTarget({ type: 'complaint-status', complaintId: 'c1' }, 'PASSENGER')).toBe('/complaints');
  expect(notificationTarget({ type: 'complaint-status' }, 'COMPANY')).toBeNull();
  expect(notificationTarget({ type: 'proximity-alert' }, 'PASSENGER')).toBeNull();
  expect(notificationTarget(null, 'PASSENGER')).toBeNull();
  expect(notificationTarget('texto', 'PASSENGER')).toBeNull();
});
