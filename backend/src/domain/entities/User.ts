import { UserRole } from '../../shared/enums';

/**
 * Entidad de dominio: Usuario
 * Representa a pasajeros, operadores de empresa y administradores.
 */
export class User {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
    public passwordHash: string,
    public role: UserRole,
    public companyId: string | null, // Solo para rol COMPANY
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  isCompany(): boolean {
    return this.role === UserRole.COMPANY;
  }

  isPassenger(): boolean {
    return this.role === UserRole.PASSENGER;
  }
}
