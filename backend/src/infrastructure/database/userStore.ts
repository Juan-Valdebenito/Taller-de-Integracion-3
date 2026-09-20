import { prisma } from './prisma/client';
import { SecurityService } from '../../shared/security/securityService';
import { v4 as uuidv4 } from 'uuid';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'PASSENGER' | 'COMPANY' | 'ADMIN';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Store en memoria inicializado con usuarios simulados para demostración y pruebas
const memoryUsers: UserRecord[] = [];

// Función para inicializar usuarios simulados con hashing seguro
async function seedMemoryUsers() {
  if (memoryUsers.length === 0) {
    const adminHash = await SecurityService.hashPassword('Admin1234!');
    const passengerHash = await SecurityService.hashPassword('Pasajero1234!');
    const companyHash = await SecurityService.hashPassword('Empresa1234!');

    memoryUsers.push(
      {
        id: 'usr-admin-01',
        name: 'Administrador General',
        email: 'admin@transporte.cl',
        passwordHash: adminHash,
        role: 'ADMIN',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-pass-01',
        name: 'Carlos Pasajero',
        email: 'carlos.pasajero@gmail.com',
        passwordHash: passengerHash,
        role: 'PASSENGER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'usr-comp-01',
        name: 'Línea 7 Operador',
        email: 'operador@linea7.cl',
        passwordHash: companyHash,
        role: 'COMPANY',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  }
}
seedMemoryUsers();

export class UserStore {
  public static async findByEmail(email: string): Promise<UserRecord | null> {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const dbUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (dbUser) return dbUser as UserRecord;
    } catch {
      // Fallback a store en memoria
    }
    return memoryUsers.find((u) => u.email.toLowerCase() === normalizedEmail) || null;
  }

  public static async findById(id: string): Promise<UserRecord | null> {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id },
      });
      if (dbUser) return dbUser as UserRecord;
    } catch {
      // Fallback a store en memoria
    }
    return memoryUsers.find((u) => u.id === id) || null;
  }

  public static async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role?: 'PASSENGER' | 'COMPANY' | 'ADMIN';
  }): Promise<UserRecord> {
    const normalizedEmail = data.email.toLowerCase().trim();
    const role = data.role || 'PASSENGER';

    try {
      const dbUser = await prisma.user.create({
        data: {
          name: data.name,
          email: normalizedEmail,
          passwordHash: data.passwordHash,
          role: role as any,
        },
      });
      return dbUser as UserRecord;
    } catch {
      // Fallback a memoria
      const newUser: UserRecord = {
        id: uuidv4(),
        name: data.name,
        email: normalizedEmail,
        passwordHash: data.passwordHash,
        role,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryUsers.push(newUser);
      return newUser;
    }
  }

  public static async update(
    id: string,
    data: { name?: string; email?: string; passwordHash?: string; isActive?: boolean }
  ): Promise<UserRecord | null> {
    try {
      const dbUser = await prisma.user.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.email && { email: data.email.toLowerCase().trim() }),
          ...(data.passwordHash && { passwordHash: data.passwordHash }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });
      return dbUser as UserRecord;
    } catch {
      // Fallback a memoria
      const user = memoryUsers.find((u) => u.id === id);
      if (!user) return null;
      if (data.name) user.name = data.name;
      if (data.email) user.email = data.email.toLowerCase().trim();
      if (data.passwordHash) user.passwordHash = data.passwordHash;
      if (data.isActive !== undefined) user.isActive = data.isActive;
      user.updatedAt = new Date();
      return user;
    }
  }

  public static async listAll(): Promise<UserRecord[]> {
    try {
      const dbUsers = await prisma.user.findMany();
      if (dbUsers && dbUsers.length > 0) return dbUsers as UserRecord[];
    } catch {
      // Fallback a memoria
    }
    return memoryUsers;
  }
}
