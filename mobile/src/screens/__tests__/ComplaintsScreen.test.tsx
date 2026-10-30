import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as complaintsApi from '../../api/complaintsApi';
import type { Complaint } from '../../api/complaintsApi';
import { ComplaintsScreen } from '../ComplaintsScreen';

jest.mock('../../api/complaintsApi', () => ({
  ...jest.requireActual('../../api/complaintsApi'),
  fetchMyComplaints: jest.fn(),
}));

const fetchMyComplaints = jest.mocked(complaintsApi.fetchMyComplaints);

const complaint = (id: string, overrides: Partial<Complaint> = {}): Complaint => ({
  id,
  title: `Reclamo ${id}`,
  description: `Detalle del reclamo ${id}`,
  category: 'DELAY',
  status: 'PENDING',
  busId: null,
  routeId: 'r1',
  companyId: 'co1',
  adminResponse: null,
  createdAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T12:00:00Z',
  ...overrides,
});

/** Promesa que el test resuelve cuando quiere. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMyComplaints.mockResolvedValue([]);
});

describe('ComplaintsScreen', () => {
  it('muestra el encabezado y "Cargando reclamos..." con los filtros a la vista', async () => {
    const pending = deferred<Complaint[]>();
    fetchMyComplaints.mockReturnValueOnce(pending.promise);
    await render(<ComplaintsScreen />);

    expect(screen.getByRole('header', { name: '📋 Mis Reclamos' })).toBeTruthy();
    expect(screen.getByText('Consulta y registra tus reclamos')).toBeTruthy();
    expect(screen.getByText('Cargando reclamos...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Categorías:: Todas las categorías' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Estados:: Todos los estados' })).toBeTruthy();
  });

  it('una tarjeta por reclamo con categoría, estado y respuesta del administrador', async () => {
    fetchMyComplaints.mockResolvedValue([
      complaint('c1', { title: 'Micro atrasada', category: 'DELAY', status: 'RESOLVED', adminResponse: 'Se habló con la empresa' }),
      complaint('c2', { title: 'Micro llena', category: 'OVERCROWDING', status: 'IN_REVIEW' }),
    ]);
    await render(<ComplaintsScreen />);

    expect(await screen.findByText('Micro atrasada')).toBeTruthy();
    expect(screen.getByText('Detalle del reclamo c1')).toBeTruthy();
    expect(screen.getByText('Categoría: Retraso')).toBeTruthy();
    expect(screen.getByText('Estado: Resuelto')).toBeTruthy();
    expect(screen.getByText('Respuesta del administrador: Se habló con la empresa')).toBeTruthy();
    expect(screen.getByText('Categoría: Exceso de pasajeros')).toBeTruthy();
    expect(screen.getByText('Estado: En revisión')).toBeTruthy();
    // Solo el primero tiene respuesta del administrador.
    expect(screen.getAllByText(/^Respuesta del administrador:/)).toHaveLength(1);
  });

  it('sin reclamos muestra el aviso vacío del web', async () => {
    await render(<ComplaintsScreen />);

    expect(await screen.findByText('No tienes reclamos')).toBeTruthy();
    expect(screen.getByText('📭')).toBeTruthy();
    expect(screen.getByText('Tus reclamos aparecerán aquí')).toBeTruthy();
  });

  it('si falla muestra el error del web (sin el aviso vacío)', async () => {
    fetchMyComplaints.mockRejectedValue(new Error('caído'));
    await render(<ComplaintsScreen />);

    expect(await screen.findByText('Error al cargar los reclamos')).toBeTruthy();
    expect(screen.queryByText('No tienes reclamos')).toBeNull();
  });

  it('al elegir un estado vuelve a pedir los reclamos con ese filtro', async () => {
    await render(<ComplaintsScreen />);
    await screen.findByText('No tienes reclamos');

    fetchMyComplaints.mockResolvedValue([complaint('c9', { title: 'Ya resuelto', status: 'RESOLVED' })]);
    await fireEvent.press(screen.getByRole('button', { name: 'Estados:: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Resuelto' }));

    expect(await screen.findByText('Ya resuelto')).toBeTruthy();
    expect(fetchMyComplaints).toHaveBeenLastCalledWith({ category: '', status: 'RESOLVED' });
    expect(screen.getByRole('button', { name: 'Estados:: Resuelto' })).toBeTruthy();
  });

  it('al elegir una categoría filtra por ella', async () => {
    await render(<ComplaintsScreen />);
    await screen.findByText('No tienes reclamos');

    await fireEvent.press(screen.getByRole('button', { name: 'Categorías:: Todas las categorías' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Accesibilidad' }));

    await waitFor(() => expect(fetchMyComplaints).toHaveBeenLastCalledWith({ category: 'ACCESSIBILITY', status: '' }));
  });
});
