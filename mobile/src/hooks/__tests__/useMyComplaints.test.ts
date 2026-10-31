import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as complaintsApi from '../../api/complaintsApi';
import type { Complaint, ComplaintFilters } from '../../api/complaintsApi';
import { LOAD_ERROR, useMyComplaints } from '../useMyComplaints';

jest.mock('../../api/complaintsApi', () => ({ fetchMyComplaints: jest.fn() }));

const fetchMyComplaints = jest.mocked(complaintsApi.fetchMyComplaints);

const complaint = (id: string, overrides: Partial<Complaint> = {}): Complaint => ({
  id,
  title: `Reclamo ${id}`,
  description: 'Descripción',
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

/** Promesa que el test resuelve cuando quiere (para simular respuestas lentas). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMyComplaints.mockResolvedValue([]);
});

describe('useMyComplaints', () => {
  it('carga los reclamos al empezar', async () => {
    fetchMyComplaints.mockResolvedValue([complaint('c1')]);
    const { result } = await renderHook(() => useMyComplaints());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.complaints.map((c) => c.id)).toEqual(['c1']);
    expect(result.current.error).toBeNull();
    expect(fetchMyComplaints).toHaveBeenCalledWith({ category: '', status: '' });
  });

  it('al cambiar un filtro vuelve a pedirlos con ese filtro', async () => {
    const { result, rerender } = await renderHook((filters: ComplaintFilters) => useMyComplaints(filters), {
      initialProps: {},
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMyComplaints.mockResolvedValue([complaint('c2', { status: 'RESOLVED' })]);
    await rerender({ status: 'RESOLVED' });

    await waitFor(() => expect(result.current.complaints.map((c) => c.id)).toEqual(['c2']));
    expect(fetchMyComplaints).toHaveBeenLastCalledWith({ category: '', status: 'RESOLVED' });
  });

  it('con cambios rápidos de filtro solo cuenta la última respuesta', async () => {
    const slow = deferred<Complaint[]>();
    fetchMyComplaints.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([complaint('nuevo')]);
    const { result, rerender } = await renderHook((filters: ComplaintFilters) => useMyComplaints(filters), {
      initialProps: {},
    });

    await rerender({ category: 'DELAY' });
    await waitFor(() => expect(result.current.complaints.map((c) => c.id)).toEqual(['nuevo']));

    await act(async () => slow.resolve([complaint('viejo')]));
    expect(result.current.complaints.map((c) => c.id)).toEqual(['nuevo']);
    expect(result.current.loading).toBe(false);
  });

  it('si falla muestra el mensaje del web', async () => {
    fetchMyComplaints.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useMyComplaints());

    await waitFor(() => expect(result.current.error).toBe(LOAD_ERROR));
    expect(LOAD_ERROR).toBe('Error al cargar los reclamos');
    expect(result.current.loading).toBe(false);
  });

  it('refresh recarga sin ocultar la lista y limpia el error', async () => {
    fetchMyComplaints.mockRejectedValueOnce(new Error('caído'));
    const { result } = await renderHook(() => useMyComplaints());
    await waitFor(() => expect(result.current.error).toBe(LOAD_ERROR));

    const next = deferred<Complaint[]>();
    fetchMyComplaints.mockReturnValueOnce(next.promise);
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.refresh();
    });
    expect(result.current.refreshing).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      next.resolve([complaint('c1')]);
      await done;
    });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.complaints.map((c) => c.id)).toEqual(['c1']);
  });

  it('una recarga que reemplaza a la carga en curso apaga ambos indicadores', async () => {
    const first = deferred<Complaint[]>();
    fetchMyComplaints.mockReturnValueOnce(first.promise).mockResolvedValueOnce([complaint('c1')]);
    const { result } = await renderHook(() => useMyComplaints());
    expect(result.current.loading).toBe(true);

    await act(() => result.current.refresh());
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
  });

  it('addComplaint pone el reclamo nuevo al inicio, como el web', async () => {
    fetchMyComplaints.mockResolvedValue([complaint('c1')]);
    const { result } = await renderHook(() => useMyComplaints());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.addComplaint(complaint('c0')));
    expect(result.current.complaints.map((c) => c.id)).toEqual(['c0', 'c1']);
  });
});
