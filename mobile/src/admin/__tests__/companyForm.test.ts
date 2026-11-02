import * as SecureStore from 'expo-secure-store';

import { createCompany, setCompanyActive, updateCompany } from '../../api/adminApi';
import { saveTokens } from '../../storage/tokenStorage';
import { bodyOf, fakeResponse, installFetchMock, type FetchMock } from '../../test-utils/http';
import { formatRut, NEW_COMPANY_FORM, rutCheckDigit, toCompanyInput, validateCompanyForm } from '../companyForm';

const mockStore = SecureStore as unknown as { __reset: () => void };
let fetchMock: FetchMock;

beforeEach(async () => {
  mockStore.__reset();
  fetchMock = installFetchMock();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

const valid = { ...NEW_COMPANY_FORM, name: 'Buses Ñielol', rut: '76.000.000-0', email: 'contacto@nielol.cl' };

describe('formulario de empresa', () => {
  it('calcula el dígito verificador y formatea el RUT como backend-go', () => {
    expect([rutCheckDigit('76000000'), rutCheckDigit('12345678'), rutCheckDigit('10000013')]).toEqual(['0', '5', 'K']);
    expect(formatRut('760000000')).toBe('76.000.000-0');
    expect(formatRut(' 10.000.013-k ')).toBe('10.000.013-K');
    expect(formatRut('1-9')).toBe('1-9');
    expect(formatRut('76.000.000-1')).toBeNull();
    expect(formatRut('0-0')).toBeNull();
    expect(formatRut('AB-C')).toBeNull();
  });

  it('valida con los mismos mensajes que el backend', () => {
    expect(validateCompanyForm(valid)).toBeNull();
    expect(validateCompanyForm({ ...valid, name: ' ' })).toBe('El nombre de la empresa es obligatorio');
    expect(validateCompanyForm({ ...valid, rut: '76.000.000-1' })).toBe('El RUT no es válido (ej: 76.123.456-7)');
    expect(validateCompanyForm({ ...valid, email: 'sin-arroba' })).toBe('El correo electrónico no es válido');
    expect(validateCompanyForm({ ...valid, phone: 'llamar' })).toMatch(/^El teléfono solo puede tener números/);
    expect(validateCompanyForm({ ...valid, phone: '+56 (45) 222-3333' })).toBeNull();
    expect(validateCompanyForm({ ...valid, address: 'x'.repeat(201) })).toBe('La dirección no puede superar 200 caracteres');
  });

  it('prepara los datos: recortados, RUT con formato, correo en minúsculas y vacíos como null', () => {
    expect(toCompanyInput({ ...valid, name: ' Buses ', rut: '760000000', email: ' A@B.CL ', phone: ' ', address: ' Temuco ' })).toEqual({
      name: 'Buses',
      rut: '76.000.000-0',
      email: 'a@b.cl',
      phone: null,
      address: 'Temuco',
    });
  });
});

describe('API de empresas', () => {
  const company = { id: 'co1', name: 'Buses', rut: '76.000.000-0', email: 'a@b.cl', phone: null, address: null, isActive: true };
  const input = { name: 'Buses', rut: '76.000.000-0', email: 'a@b.cl', phone: null, address: null };

  it('crea, edita y cambia el estado con los endpoints de backend-go', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: company }));

    await createCompany(input);
    await updateCompany('co 1', input);
    await setCompanyActive('co1', false);

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${new URL(url).pathname.replace(/.*\/api\/v1/, '')}`);
    expect(calls).toEqual(['POST /companies', 'PUT /companies/co%201', 'PATCH /companies/co1/status']);
    expect(bodyOf(fetchMock, 0)).toEqual(input);
    expect(bodyOf(fetchMock, 2)).toEqual({ isActive: false });
  });

  it('un rechazo del backend llega con su mensaje', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 409, body: { error: 'ya existe una empresa con ese correo electrónico' } }));
    await expect(createCompany(input)).rejects.toMatchObject({ status: 409, message: 'ya existe una empresa con ese correo electrónico' });
  });
});
