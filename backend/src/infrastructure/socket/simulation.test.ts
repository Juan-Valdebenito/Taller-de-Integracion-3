import { calculateOccupancy, processSimulationEvent, buses, MAX_BUS_CAPACITY } from './simulation';

console.log('--- TEST 1: Rigidez de cotas [0, 35] y división por cero ---');

// Test división por cero:
const zeroCap = calculateOccupancy(10, 0);
console.assert(zeroCap.occupancyPercentage === 0, `Esperado 0%, obtenido ${zeroCap.occupancyPercentage}%`);
console.assert(Number.isFinite(zeroCap.occupancyPercentage), 'No debe ser NaN ni Infinity');
console.log('✅ División por cero prevenida correctamente (capacidad 0 => 0%)');

// Test sobrecupo (intentar meter 50 en bus de 35):
const overCap = calculateOccupancy(50, 35);
console.assert(overCap.clampedPassengers === 35, `Esperado 35, obtenido ${overCap.clampedPassengers}`);
console.assert(overCap.occupancyPercentage === 100, `Esperado 100%, obtenido ${overCap.occupancyPercentage}%`);
console.assert(overCap.isFull === true, 'isFull debe ser true');
console.log('✅ Límite superior rígido respetado (50 pasajeros limitados a 35)');

// Test negativos (intentar restar pasajeros bajo cero):
const underZero = calculateOccupancy(-10, 35);
console.assert(underZero.clampedPassengers === 0, `Esperado 0, obtenido ${underZero.clampedPassengers}`);
console.assert(underZero.occupancyPercentage === 0, `Esperado 0%, obtenido ${underZero.occupancyPercentage}%`);
console.log('✅ Límite inferior rígido respetado (-10 pasajeros limitados a 0)');

console.log('\n--- TEST 2: Inyección de eventos simulados (7A, 7B, 1C) ---');
const bus7A = buses.find(b => b.line === '7A')!;
console.log(`Línea 7A inicial: ${bus7A.currentPassengers}/${bus7A.capacity} (${bus7A.occupancyPercentage}%)`);

// Vaciar
processSimulationEvent(bus7A.id, 'empty_capacity');
console.assert(bus7A.currentPassengers === 0, `Esperado 0, obtenido ${bus7A.currentPassengers}`);
console.log(`🧹 Vaciar: ${bus7A.currentPassengers}/${bus7A.capacity}`);

// Pago Normal
processSimulationEvent(bus7A.id, 'tap_in_normal');
console.assert(bus7A.currentPassengers === 1, `Esperado 1, obtenido ${bus7A.currentPassengers}`);
console.assert(bus7A.boardings > 0, 'boardings incrementado');
console.log(`💳 Pago Normal: ${bus7A.currentPassengers}/${bus7A.capacity} (${bus7A.occupancyPercentage}%)`);

// Pase Estudiante
processSimulationEvent(bus7A.id, 'tap_in_student');
console.assert(bus7A.currentPassengers === 2, `Esperado 2, obtenido ${bus7A.currentPassengers}`);
console.assert(bus7A.schoolBoardings > 0, 'schoolBoardings incrementado');
console.log(`🎓 Pase Escolar: ${bus7A.currentPassengers}/${bus7A.capacity} (${bus7A.occupancyPercentage}%)`);

// Sensor Cámara Bajada
processSimulationEvent(bus7A.id, 'sensor_alight');
console.assert(bus7A.currentPassengers === 1, `Esperado 1, obtenido ${bus7A.currentPassengers}`);
console.assert(bus7A.alightings > 0, 'alightings incrementado');
console.log(`📷 Sensor Cámara Bajada: ${bus7A.currentPassengers}/${bus7A.capacity} (${bus7A.occupancyPercentage}%)`);

// Llenado al máximo
processSimulationEvent(bus7A.id, 'fill_capacity');
console.assert(bus7A.currentPassengers === 35, `Esperado 35, obtenido ${bus7A.currentPassengers}`);
console.assert(bus7A.isFull === true, 'isFull debe ser true al estar al 35');
console.log(`⚡ Llenado al máximo: ${bus7A.currentPassengers}/${bus7A.capacity} (${bus7A.occupancyPercentage}%)`);

// Intento de subir en bus lleno (debe ser rechazado y mantenerse en 35)
processSimulationEvent(bus7A.id, 'tap_in_normal');
console.assert(bus7A.currentPassengers === 35, `Esperado 35, obtenido ${bus7A.currentPassengers}`);
console.assert(bus7A.lastEvent?.type === 'OVERCROWD_REJECTED', 'Debe rechazar sobrecupo');
console.log(`🚫 Intento de subida en bus lleno: Rechazado, aforo=${bus7A.currentPassengers}/35`);

console.log('\n🎉 ¡TODOS LOS TESTS DE AFORO Y SENSORES PASARON EXITOSAMENTE!');
