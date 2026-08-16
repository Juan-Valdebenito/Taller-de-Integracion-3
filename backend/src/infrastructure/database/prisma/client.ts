import { PrismaClient } from '@prisma/client';

// ── Singleton de PrismaClient ──────────────────────────────
// En desarrollo, Next.js / ts-node-dev hacen hot reload,
// lo que crearía múltiples instancias. Usamos un global para evitarlo.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
