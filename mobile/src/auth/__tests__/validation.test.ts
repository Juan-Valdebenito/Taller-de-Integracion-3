import { hasErrors, isValidEmail, validateLogin, validateRegister } from '../validation';

describe('isValidEmail', () => {
  it.each(['ana@correo.cl', '  ana.perez@uct.cl  ', 'a+b@sub.dominio.com'])('acepta %p', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'ana', 'ana@', 'ana@correo', 'ana correo@x.cl'])('rechaza %p', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('validateLogin', () => {
  it('exige correo y contraseña', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Ingresa tu correo electrónico.',
      password: 'Ingresa tu contraseña.',
    });
  });

  it('rechaza un correo mal escrito', () => {
    expect(validateLogin({ email: 'ana@', password: 'x' }).email).toBe('El correo electrónico no es válido.');
  });

  it('no exige largo mínimo en el login (eso lo decide el servidor)', () => {
    expect(hasErrors(validateLogin({ email: 'ana@correo.cl', password: '123' }))).toBe(false);
  });
});

describe('validateRegister', () => {
  const valid = { name: 'Ana', email: 'ana@correo.cl', password: 'secreta123', confirmPassword: 'secreta123' };

  it('acepta un formulario válido', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it('exige contraseña de al menos 8 caracteres, igual que backend-go', () => {
    expect(validateRegister({ ...valid, password: '1234567', confirmPassword: '1234567' }).password).toBe(
      'La contraseña debe tener al menos 8 caracteres.',
    );
  });

  it('detecta contraseñas que no coinciden', () => {
    expect(validateRegister({ ...valid, confirmPassword: 'otra12345' }).confirmPassword).toBe('Las contraseñas no coinciden.');
  });

  it('exige nombre no vacío', () => {
    expect(validateRegister({ ...valid, name: '   ' }).name).toBe('Ingresa tu nombre.');
  });
});
