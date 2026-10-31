import { renderHook, waitFor } from '@testing-library/react-native';

import * as complaintsApi from '../../api/complaintsApi';
import { COMPANY_COMPLAINTS_LOAD_ERROR, useCompanyComplaints } from '../useCompanyComplaints';

jest.mock('../../api/complaintsApi', () => ({ fetchCompanyComplaints: jest.fn() }));

const fetchCompanyComplaints = jest.mocked(complaintsApi.fetchCompanyComplaints);

beforeEach(() => {
  jest.clearAllMocks();
  fetchCompanyComplaints.mockResolvedValue([]);
});

describe('useCompanyComplaints', () => {
  it('carga únicamente los reclamos de la empresa y se recarga al filtrar', async () => {
    const { rerender } = await renderHook((status: '' | 'RESOLVED') => useCompanyComplaints('co1', { status }), { initialProps: '' as const });
    await waitFor(() => expect(fetchCompanyComplaints).toHaveBeenCalledWith('co1', { category: '', status: '' }));

    await rerender('RESOLVED');
    await waitFor(() => expect(fetchCompanyComplaints).toHaveBeenLastCalledWith('co1', { category: '', status: 'RESOLVED' }));
  });

  it('informa el error de carga sin inventar reclamos', async () => {
    fetchCompanyComplaints.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useCompanyComplaints('co1'));

    await waitFor(() => expect(result.current.error).toBe(COMPANY_COMPLAINTS_LOAD_ERROR));
    expect(result.current.complaints).toEqual([]);
  });
});
