/**
 * Seed de Prisma - Plataforma Transporte Público Urbano
 * =====================================================
 * Inserta datos de desarrollo idempotentes (upsert).
 *
 * Ejecución:
 *   npx ts-node src/infrastructure/database/prisma/seed.ts
 *   -- o desde la raíz --
 *   npm run db:seed
 */

import { PrismaClient, TripStatus, ComplaintStatus, ComplaintCategory, BusStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed de base de datos...\n');

  // ── 1. Empresa ──────────────────────────────────────────────
  console.log('📦 Creando empresa...');
  const company = await prisma.company.upsert({
    where: { rut: '76.123.456-7' },
    update: {},
    create: {
      name: 'Buses del Norte S.A.',
      rut: '76.123.456-7',
      address: 'Av. Arturo Prat 1234, Iquique',
      phone: '+56 57 2 234567',
      email: 'contacto@busesdelnorte.cl',
      isActive: true,
    },
  });
  console.log(`   ✅ Empresa: ${company.name} (${company.id})`);

  // ── 2. Usuarios ─────────────────────────────────────────────
  console.log('\n👤 Creando usuarios...');

  const adminHash     = await bcrypt.hash('Admin1234!',     SALT_ROUNDS);
  const operadorHash  = await bcrypt.hash('Operador1234!',  SALT_ROUNDS);
  const pasajero1Hash = await bcrypt.hash('Pasajero1234!',  SALT_ROUNDS);
  const pasajero2Hash = await bcrypt.hash('Pasajero5678!',  SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@transporte.cl' },
    update: {},
    create: {
      name: 'Administrador Sistema',
      email: 'admin@transporte.cl',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  console.log(`   ✅ Admin: ${admin.email}`);

  const operador = await prisma.user.upsert({
    where: { email: 'operador@busesdelnorte.cl' },
    update: {},
    create: {
      name: 'Carlos Rodríguez',
      email: 'operador@busesdelnorte.cl',
      passwordHash: operadorHash,
      role: UserRole.COMPANY,
      companyId: company.id,
      isActive: true,
    },
  });
  console.log(`   ✅ Operador empresa: ${operador.email}`);

  const pasajero1 = await prisma.user.upsert({
    where: { email: 'juan.perez@mail.com' },
    update: {},
    create: {
      name: 'Juan Pérez',
      email: 'juan.perez@mail.com',
      passwordHash: pasajero1Hash,
      role: UserRole.PASSENGER,
      isActive: true,
    },
  });
  console.log(`   ✅ Pasajero 1: ${pasajero1.email}`);

  const pasajero2 = await prisma.user.upsert({
    where: { email: 'maria.gonzalez@mail.com' },
    update: {},
    create: {
      name: 'María González',
      email: 'maria.gonzalez@mail.com',
      passwordHash: pasajero2Hash,
      role: UserRole.PASSENGER,
      isActive: true,
    },
  });
  console.log(`   ✅ Pasajero 2: ${pasajero2.email}`);

  // ── 3. Rutas ────────────────────────────────────────────────
  console.log('\n🗺️  Creando rutas...');

  // Verificar y crear Ruta A si no existe
  const existingRouteA = await prisma.route.findUnique({ where: { code: 'L1' } });
  let routeA = existingRouteA;

  if (!routeA) {
    routeA = await prisma.route.create({
      data: {
        name: 'Línea 1 - Centro → Terminal',
        code: 'L1',
        description: 'Recorrido principal Centro ciudad hasta Terminal de Buses',
        companyId: company.id,
        isActive: true,
        stops: {
          create: [
            { name: 'Plaza de Armas',    latitude: -20.2133, longitude: -70.1503, order: 1 },
            { name: 'Hospital Regional', latitude: -20.2195, longitude: -70.1432, order: 2 },
            { name: 'Mall Iquique',      latitude: -20.2289, longitude: -70.1367, order: 3 },
            { name: 'Terminal de Buses', latitude: -20.2401, longitude: -70.1285, order: 4 },
          ],
        },
      },
    });
  }
  console.log(`   ✅ Ruta: ${routeA.name} (${routeA.code})`);

  const existingRouteB = await prisma.route.findUnique({ where: { code: 'L2' } });
  let routeB = existingRouteB;

  if (!routeB) {
    routeB = await prisma.route.create({
      data: {
        name: 'Línea 2 - Población → Puerto',
        code: 'L2',
        description: 'Recorrido desde Población Norte hasta el Puerto',
        companyId: company.id,
        isActive: true,
        stops: {
          create: [
            { name: 'Población Norte',   latitude: -20.1987, longitude: -70.1612, order: 1 },
            { name: 'Liceo Industrial',  latitude: -20.2045, longitude: -70.1558, order: 2 },
            { name: 'Mercado Central',   latitude: -20.2112, longitude: -70.1495, order: 3 },
            { name: 'Puerto de Iquique', latitude: -20.2167, longitude: -70.1438, order: 4 },
          ],
        },
      },
    });
  }
  console.log(`   ✅ Ruta: ${routeB.name} (${routeB.code})`);

  // ── 4. Micros ───────────────────────────────────────────────
  console.log('\n🚌 Creando micros...');

  const bus1 = await prisma.bus.upsert({
    where: { patente: 'BCDF-10' },
    update: {},
    create: {
      patente: 'BCDF-10',
      capacity: 45,
      currentPassengers: 12,
      boardings: 87,
      alightings: 75,
      schoolBoardings: 8,
      status: BusStatus.ACTIVE,
      companyId: company.id,
      routeId: routeA.id,
      lastLatitude: -20.2195,
      lastLongitude: -70.1432,
      lastHeading: 180,
      lastSpeed: 35,
      lastLocationAt: new Date(),
    },
  });
  console.log(`   ✅ Bus: ${bus1.patente} → Ruta ${routeA.code}`);

  const bus2 = await prisma.bus.upsert({
    where: { patente: 'BCDF-11' },
    update: {},
    create: {
      patente: 'BCDF-11',
      capacity: 45,
      currentPassengers: 30,
      boardings: 112,
      alightings: 82,
      schoolBoardings: 15,
      status: BusStatus.ACTIVE,
      companyId: company.id,
      routeId: routeA.id,
      lastLatitude: -20.2289,
      lastLongitude: -70.1367,
      lastHeading: 200,
      lastSpeed: 28,
      lastLocationAt: new Date(),
    },
  });
  console.log(`   ✅ Bus: ${bus2.patente} → Ruta ${routeA.code}`);

  const bus3 = await prisma.bus.upsert({
    where: { patente: 'BCDF-20' },
    update: {},
    create: {
      patente: 'BCDF-20',
      capacity: 40,
      currentPassengers: 5,
      boardings: 63,
      alightings: 58,
      schoolBoardings: 3,
      status: BusStatus.ACTIVE,
      companyId: company.id,
      routeId: routeB.id,
      lastLatitude: -20.2045,
      lastLongitude: -70.1558,
      lastHeading: 90,
      lastSpeed: 42,
      lastLocationAt: new Date(),
    },
  });
  console.log(`   ✅ Bus: ${bus3.patente} → Ruta ${routeB.code}`);

  // ── 5. Viajes (Trip) ────────────────────────────────────────
  console.log('\n🛣️  Creando viajes...');

  const tripCompletado = await prisma.trip.create({
    data: {
      busId: bus1.id,
      routeId: routeA.id,
      departureTime: new Date(Date.now() - 3 * 60 * 60 * 1000), // Hace 3 horas
      arrivalTime:   new Date(Date.now() - 2 * 60 * 60 * 1000), // Hace 2 horas
      status: TripStatus.COMPLETED,
    },
  });
  console.log(`   ✅ Viaje completado: Bus ${bus1.patente} en Ruta ${routeA.code}`);

  const tripEnCurso = await prisma.trip.create({
    data: {
      busId: bus2.id,
      routeId: routeA.id,
      departureTime: new Date(Date.now() - 30 * 60 * 1000), // Hace 30 min
      status: TripStatus.IN_PROGRESS,
    },
  });
  console.log(`   ✅ Viaje en curso: Bus ${bus2.patente} en Ruta ${routeA.code}`);

  // ── 6. Registros de Pasajeros (PassengerLog) ────────────────
  console.log('\n📊 Creando registros de pasajeros...');

  await prisma.passengerLog.createMany({
    data: [
      {
        tripId: tripCompletado.id,
        boardings: 15,
        alightings: 0,
        isSchool: false,
        locationLat: -20.2133,
        locationLng: -70.1503,
        recordedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        tripId: tripCompletado.id,
        boardings: 8,
        alightings: 12,
        isSchool: true,
        locationLat: -20.2195,
        locationLng: -70.1432,
        recordedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      },
      {
        tripId: tripCompletado.id,
        boardings: 5,
        alightings: 18,
        isSchool: false,
        locationLat: -20.2289,
        locationLng: -70.1367,
        recordedAt: new Date(Date.now() - 2.2 * 60 * 60 * 1000),
      },
      {
        tripId: tripEnCurso.id,
        boardings: 22,
        alightings: 3,
        isSchool: false,
        locationLat: -20.2133,
        locationLng: -70.1503,
        recordedAt: new Date(Date.now() - 25 * 60 * 1000),
      },
    ],
  });
  console.log('   ✅ 4 registros de pasajeros creados');

  // ── 7. Reclamos (Complaint) ─────────────────────────────────
  console.log('\n📝 Creando reclamos...');

  await prisma.complaint.create({
    data: {
      title: 'Micro con retraso de más de 30 minutos',
      description: 'Esperé más de 30 minutos en la parada Plaza de Armas y la micro no llegó.',
      category: ComplaintCategory.DELAY,
      status: ComplaintStatus.IN_REVIEW,
      passengerId: pasajero1.id,
      busId: bus1.id,
      routeId: routeA.id,
      companyId: company.id,
      tripId: tripCompletado.id,
    },
  });
  console.log('   ✅ Reclamo 1: Retraso (EN REVISIÓN)');

  await prisma.complaint.create({
    data: {
      title: 'Sobrepasaje: micro completamente llena',
      description: 'La micro iba con mucha más gente de la que cabe, fue muy incómodo y peligroso.',
      category: ComplaintCategory.OVERCROWDING,
      status: ComplaintStatus.RESOLVED,
      adminResponse: 'Agradecemos su reporte. Se aplicaron medidas para regular la frecuencia del recorrido.',
      passengerId: pasajero2.id,
      busId: bus2.id,
      routeId: routeA.id,
      companyId: company.id,
    },
  });
  console.log('   ✅ Reclamo 2: Sobrepasaje (RESUELTO)');

  await prisma.complaint.create({
    data: {
      title: 'Conductor no respetó parada',
      description: 'El conductor no se detuvo en la parada del Hospital Regional aunque hicimos señas.',
      category: ComplaintCategory.DRIVER_BEHAVIOR,
      status: ComplaintStatus.PENDING,
      passengerId: pasajero1.id,
      busId: bus3.id,
      routeId: routeB.id,
      companyId: company.id,
    },
  });
  console.log('   ✅ Reclamo 3: Conducta del conductor (PENDIENTE)');

  // ── Resumen ─────────────────────────────────────────────────
  console.log('\n✨ Seed completado exitosamente!\n');
  console.log('📋 Credenciales de acceso:');
  console.log('   Admin:     admin@transporte.cl        / Admin1234!');
  console.log('   Operador:  operador@busesdelnorte.cl  / Operador1234!');
  console.log('   Pasajero1: juan.perez@mail.com        / Pasajero1234!');
  console.log('   Pasajero2: maria.gonzalez@mail.com    / Pasajero5678!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
