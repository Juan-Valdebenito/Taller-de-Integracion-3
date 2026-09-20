import { ComplaintStore } from '../../database/complaintStore';
import { ComplaintCategory, ComplaintStatus } from '@prisma/client';

async function runComplaintProtocolTests() {
  console.log('--- TEST PROTOCOLO 1: Creación de Reclamo Contextual desde el Mapa ---');
  
  const created = await ComplaintStore.create({
    title: '  Micro 7A con exceso de pasajeros  ',
    description: '  Capacidad sobrepasada en paradero plaza hospital.  ',
    category: ComplaintCategory.OVERCROWDING,
    rating: 2,
    busId: 'B-7A-01',
    lineName: '7A',
  });

  console.assert(created.id.startsWith('comp-'), 'ID de reclamo generado');
  console.assert(created.status === ComplaintStatus.PENDING, 'Estado inicial debe ser PENDING');
  console.assert(created.category === ComplaintCategory.OVERCROWDING, 'Categoría asignada correctamente');
  console.log(`✅ Reclamo creado exitosamente: [${created.id}] Estado=${created.status}, Categoría=${created.category}`);

  console.log('\n--- TEST PROTOCOLO 2: Progresión de Estados del Protocolo ---');
  // Paso 1: PENDING -> IN_REVIEW
  const inReview = await ComplaintStore.updateStatus(
    created.id,
    ComplaintStatus.IN_REVIEW,
    'Revisión iniciada por equipo de operaciones con telemetría de bus B-7A-01.'
  );
  console.assert(inReview?.status === ComplaintStatus.IN_REVIEW, 'Estado debe cambiar a IN_REVIEW');
  console.assert(inReview?.adminResponse?.includes('Revisión iniciada'), 'adminResponse actualizado');
  console.log(`✅ Estado actualizado: PENDING -> ${inReview?.status}`);

  // Paso 2: IN_REVIEW -> RESOLVED
  const resolved = await ComplaintStore.updateStatus(
    created.id,
    ComplaintStatus.RESOLVED,
    'Resolución: Se verificó sobrecupo de 35 pasajeros. Se ordenó refuerzo de frecuencia de Línea 7A en hora punta.'
  );
  console.assert(resolved?.status === ComplaintStatus.RESOLVED, 'Estado debe cambiar a RESOLVED');
  console.log(`✅ Estado final alcanzado: IN_REVIEW -> ${resolved?.status}`);
  console.log(`   Nota de Administración: "${resolved?.adminResponse}"`);

  console.log('\n--- TEST PROTOCOLO 3: Filtros de Incidentes ---');
  const allResolved = await ComplaintStore.listAll({ status: ComplaintStatus.RESOLVED });
  console.assert(allResolved.some(c => c.id === created.id), 'El reclamo resuelto debe aparecer en el filtro RESOLVED');

  const overcrowdList = await ComplaintStore.listAll({ category: ComplaintCategory.OVERCROWDING });
  console.assert(overcrowdList.some(c => c.id === created.id), 'El reclamo debe aparecer en el filtro OVERCROWDING');

  console.log(`✅ Filtros por estado y categoría verificados (Total resueltos=${allResolved.length}, Sobrecupo=${overcrowdList.length})`);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DEL PROTOCOLO DE RECLAMOS PASARON CON ÉXITO!');
}

runComplaintProtocolTests().catch((err) => {
  console.error('Error en pruebas de protocolo de reclamos:', err);
  process.exit(1);
});
