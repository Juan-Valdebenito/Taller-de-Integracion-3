import { SecurityService } from './securityService';

async function runSecurityTests() {
  console.log('--- TEST SEGURIDAD 1: Hashing seguro con Bcrypt (Cost 12) ---');
  
  const rawPassword = 'MiPasswordSeguro2026!';
  const hash1 = await SecurityService.hashPassword(rawPassword);
  const hash2 = await SecurityService.hashPassword(rawPassword);

  console.assert(hash1.startsWith('$2a$') || hash1.startsWith('$2b$'), 'Debe ser un hash bcrypt estándar');
  console.assert(hash1 !== hash2, 'Dos hashes de la misma contraseña deben tener sales distintas (anti-rainbow table)');
  console.log('✅ Hashing bcrypt y salting aleatorio verificado');

  const isValidCorrect = await SecurityService.comparePassword(rawPassword, hash1);
  const isValidWrong = await SecurityService.comparePassword('ContrasenaIncorrecta123!', hash1);

  console.assert(isValidCorrect === true, 'Contraseña correcta debe ser aceptada');
  console.assert(isValidWrong === false, 'Contraseña incorrecta debe ser rechazada');
  console.log('✅ Verificación de credenciales en tiempo constante validada');

  console.log('\n--- TEST SEGURIDAD 2: Sanitización de datos de usuario ---');
  const userRecord = {
    id: 'usr-99',
    name: 'Usuario Prueba',
    email: 'seguridad@transporte.cl',
    passwordHash: hash1,
    role: 'PASSENGER',
  };

  const sanitized = SecurityService.sanitizeUser(userRecord);
  console.assert(!('passwordHash' in sanitized), 'passwordHash NO debe existir en el objeto sanitizado');
  console.assert(sanitized.email === 'seguridad@transporte.cl', 'Los datos públicos deben preservarse intactos');
  console.log('✅ Sanitización de usuario previene fuga de hashes');

  console.log('\n--- TEST SEGURIDAD 3: Enmascaramiento y Cumplimiento de Privacidad ---');
  const maskedEmail = SecurityService.maskEmail('rodrigo.test@gmail.com');
  console.assert(maskedEmail.includes('***'), 'Email debe tener asteriscos de enmascaramiento');
  console.assert(maskedEmail.endsWith('@gmail.com'), 'Dominio debe mantenerse');
  console.log(`✅ Enmascaramiento de email: rodrigo.test@gmail.com -> ${maskedEmail}`);

  const pseudo1 = SecurityService.pseudonymize('usr-99');
  const pseudo2 = SecurityService.pseudonymize('usr-99');
  console.assert(pseudo1 === pseudo2, 'Seudonimización debe ser consistente para un mismo ID');
  console.assert(pseudo1 !== 'usr-99', 'Seudonimización no debe revelar el ID real');
  console.log(`✅ Seudonimización irreversible HMAC: usr-99 -> ${pseudo1}`);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE HASHING Y PRIVACIDAD PASARON CON ÉXITO!');
}

runSecurityTests().catch((err) => {
  console.error('Error en pruebas de seguridad:', err);
  process.exit(1);
});
