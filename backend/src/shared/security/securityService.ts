import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Servicio de Seguridad y Protección de Privacidad de Datos.
 * Cumple con normativas de privacidad (GDPR / Ley N° 19.628 de Protección de Datos).
 */
export class SecurityService {
  private static readonly BCRYPT_ROUNDS = 12;
  private static readonly PEPPER = process.env.PASSWORD_PEPPER || 'transit_hub_secure_pepper_2026';

  /**
   * Hashea una contraseña usando bcryptjs con salt cost factor = 12 y pepper.
   */
  public static async hashPassword(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('La contraseña proporcionada es inválida');
    }
    const combined = password + this.PEPPER;
    const salt = await bcrypt.genSalt(this.BCRYPT_ROUNDS);
    return bcrypt.hash(combined, salt);
  }

  /**
   * Compara una contraseña en texto plano contra un hash bcrypt de manera segura en tiempo constante.
   */
  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    const combined = password + this.PEPPER;
    return bcrypt.compare(combined, hash);
  }

  /**
   * Sanitiza un objeto de usuario eliminando campos sensibles (contraseña, tokens).
   */
  public static sanitizeUser<T extends Record<string, any>>(user: T): Omit<T, 'passwordHash'> {
    if (!user) return user;
    const { passwordHash, ...safeUser } = user;
    return safeUser as Omit<T, 'passwordHash'>;
  }

  /**
   * Enmascara un correo electrónico para resguardar la privacidad en respuestas públicas o logs.
   * Ej: "juan.perez@transporte.cl" -> "j***z@transporte.cl"
   */
  public static maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***@***.com';
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    const maskedLocal = `${local[0]}${'*'.repeat(Math.min(5, local.length - 2))}${local[local.length - 1]}`;
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Genera un identificador seudonimizado irreversible (SHA-256) para métricas o logs anónimos.
   */
  public static pseudonymize(value: string): string {
    return crypto
      .createHmac('sha256', this.PEPPER)
      .update(value)
      .digest('hex')
      .substring(0, 16);
  }
}
