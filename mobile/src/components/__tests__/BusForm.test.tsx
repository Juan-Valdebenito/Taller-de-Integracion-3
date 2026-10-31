import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as companyApi from '../../api/companyApi';
import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { formatPlate, isValidPlate, NEW_BUS_FORM, validateBusForm } from '../../company/busForm';
import { BusForm } from '../BusForm';

jest.mock('../../api/companyApi', () => ({
  createCompanyBus: jest.fn(),
  saveCompanyBus: jest.fn(),
  updateCompanyBus: jest.fn(),
}));

const api = jest.mocked(companyApi);
const routes: CompanyRoute[] = [{ id: 'r7a', code: '7A', name: 'Cajón / Sta Rosa', isActive: true, companyId: 'co1' }];
const existing: CompanyBus = { id: 'b1', patente: 'BGPK-45', capacity: 35, currentPassengers: 14, status: 'ACTIVE', companyId: 'co1', routeId: 'r7a' };

beforeEach(() => {
  jest.clearAllMocks();
  api.createCompanyBus.mockImplementation(async (input) => ({ ...existing, ...input, id: 'nueva', status: 'INACTIVE', currentPassengers: 0, routeId: input.routeId }));
  api.saveCompanyBus.mockImplementation(async (id, input) => ({ ...existing, ...input, id }));
  api.updateCompanyBus.mockImplementation(async (id, changes) => ({ ...existing, id, ...changes }) as CompanyBus);
});

describe('validaciones del formulario de micro', () => {
  it('usa los mensajes del web y el formato de patente del backend', () => {
    expect(validateBusForm({ ...NEW_BUS_FORM, patente: ' ' })).toBe('La patente es requerida (ej: ABCD-12).');
    expect(validateBusForm({ ...NEW_BUS_FORM, patente: 'ABC123' })).toBe('Formato de patente inválido. Formatos aceptados: ABCD-12 o AB-1234.');
    expect(validateBusForm({ ...NEW_BUS_FORM, patente: 'BGPK45', capacity: '0' })).toBe('La capacidad debe ser un número entero mayor a 0.');
    expect(validateBusForm({ ...NEW_BUS_FORM, patente: 'BGPK45', capacity: '3.5' })).toBe('La capacidad debe ser un número entero mayor a 0.');
    expect(validateBusForm({ ...NEW_BUS_FORM, patente: 'bgpk-45' })).toBeNull();
  });

  it('formatea la patente como backend-go', () => {
    expect(formatPlate(' bgpk45 ')).toBe('BGPK-45');
    expect(formatPlate('ab1234')).toBe('AB-1234');
    expect(formatPlate('CRTM-12')).toBe('CRTM-12');
    expect([isValidPlate('AB-1234'), isValidPlate('ABCD12'), isValidPlate('A1B2C3')]).toEqual([true, true, false]);
  });
});

describe('BusForm', () => {
  async function renderForm(bus: CompanyBus | null = null) {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    await render(<BusForm visible bus={bus} routes={routes} companyId="co1" onClose={onClose} onSaved={onSaved} />);
    return { onSaved, onClose };
  }

  it('registra una micro en la empresa del usuario, con la patente formateada', async () => {
    const { onSaved } = await renderForm();
    expect(screen.getByRole('header', { name: '➕ Registrar Nueva Micro' })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Patente (Placa Patente Única)'), 'hjty88');
    await fireEvent.changeText(screen.getByLabelText('Capacidad Máxima de Pasajeros'), '40');
    await fireEvent.press(screen.getByRole('button', { name: 'Línea / Ruta Asignada: Sin Asignar (Reserva en Terminal)' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Línea 7A – Cajón / Sta Rosa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar Micro' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Micro HJTY-88 incorporada a la flota'));
    expect(api.createCompanyBus).toHaveBeenCalledWith({ patente: 'HJTY-88', capacity: 40, routeId: 'r7a', companyId: 'co1' });
    // El backend la crea INACTIVE y el formulario pedía "En Servicio": se aplica enseguida.
    expect(api.updateCompanyBus).toHaveBeenCalledWith('nueva', { status: 'ACTIVE' });
  });

  it('si se elige "Inactiva" al registrar, no hace falta otra solicitud', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Patente (Placa Patente Única)'), 'AB1234');
    await fireEvent.press(screen.getByRole('button', { name: 'Estado Operacional: En Servicio (Operando en Calle)' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactiva (Fuera de Servicio)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar Micro' }));

    await waitFor(() => expect(api.createCompanyBus).toHaveBeenCalled());
    expect(api.updateCompanyBus).not.toHaveBeenCalled();
  });

  it('edita una micro con sus datos cargados', async () => {
    const { onSaved } = await renderForm(existing);
    expect(screen.getByRole('header', { name: '✏️ Editar Micro BGPK-45' })).toBeTruthy();
    expect(screen.getByLabelText('Patente (Placa Patente Única)').props.value).toBe('BGPK-45');
    expect(screen.getByLabelText('Capacidad Máxima de Pasajeros').props.value).toBe('35');

    await fireEvent.press(screen.getByRole('button', { name: 'Estado Operacional: En Servicio (Operando en Calle)' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'En Taller (Mantenimiento Mecánico)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Micro BGPK-45 actualizada exitosamente'));
    expect(api.saveCompanyBus).toHaveBeenCalledWith('b1', { patente: 'BGPK-45', capacity: 35, routeId: 'r7a', status: 'MAINTENANCE' });
  });

  it('no envía si algo no es válido, y muestra el error del backend si lo rechaza', async () => {
    const { onSaved } = await renderForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar Micro' }));
    expect(screen.getByText('La patente es requerida (ej: ABCD-12).')).toBeTruthy();
    expect(api.createCompanyBus).not.toHaveBeenCalled();

    api.createCompanyBus.mockRejectedValueOnce(new ApiError(403, 'No tienes permiso para realizar esta acción.'));
    await fireEvent.changeText(screen.getByLabelText('Patente (Placa Patente Única)'), 'ZZZZ99');
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar Micro' }));

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('"Cancelar" cierra sin guardar', async () => {
    const { onClose } = await renderForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.createCompanyBus).not.toHaveBeenCalled();
  });
});
