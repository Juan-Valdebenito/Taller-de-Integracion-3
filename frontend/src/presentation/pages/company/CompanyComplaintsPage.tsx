import { useEffect, useState } from 'react';
import { apiClient } from '../../../infrastructure/api/apiClient';

type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  status: ComplaintStatus;
  passengerId: string;
  busId: string | null;
  routeId: string | null;
  companyId: string;
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

/*interface DriverIncident {
  id: string;
  driverName: string;
  busUnit: string;
  route: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  timestamp: string;
} */

const CATEGORY_LABELS: Record<string, string> = {
  DELAY: 'Retraso',
  OVERCROWDING: 'Exceso de pasajeros',
  DRIVER_BEHAVIOR: 'Comportamiento del conductor',
  VEHICLE_CONDITION: 'Condición del vehículo',
  ACCESSIBILITY: 'Accesibilidad',
  OTHER: 'Otro',
};

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelto',
  REJECTED: 'Rechazado',
};

export function CompanyComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  //const [busFilter, setBusFilter] = useState('');

  const loadComplaints = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();

      if (categoryFilter) {
        params.set('category', categoryFilter);
      }

      if (statusFilter) {
        params.set('status', statusFilter);
      }

      const query = params.toString();

      const response = await apiClient.get<Complaint[]>(
        `/complaints/my-complaints${query ? `?${query}` : ''}`
      );

      setComplaints(response.data);
    } catch (err) {
      console.error('Error al cargar los reclamos:', err);
      setError('Error al cargar los reclamos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, [categoryFilter, statusFilter]);

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <h1>Reclamos</h1>
        <p>Cargando Reclamos...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-8) '}}>
      <div style={{ marginBottom: 'var(--space-6) '}}>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
          }}
        >
          Reclamos
        </h1>

        <p style={{ color: 'var(--color-text-secondary)' }}>
          Consulta los reclamos registrados por los pasajeros.
        </p>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 'var(--space-6)',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-background-secondary)',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label>Categoria: </label>

          <select 
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)
            }
          >
            <option value="">Todas las categorías</option>
            <option value="DELAY">Retraso</option>
            <option value="OVERCROWDING">Exceso de pasajeros</option>
            <option value="DRIVER_BEHAVIOR">Comportamiento del conductor</option>
            <option value="VEHICLE_CONDITION">Estado del vehículo</option>
            <option value="ACCESSIBILITY">Accesibilidad</option>
            <option value="OTHER">Otro</option>            
          </select>
        </div>

        <div>
          <label>Estado: </label>

          <select 
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)
            }
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="IN_REVIEW">En revisión</option>
            <option value="RESOLVED">Resuelto</option>
            <option value="REJECTED">Rechazado</option>
          </select>
        </div>
      </div>

      {complaints.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
          }}
        >
          <h2>No hay reclamos</h2>

          <p style={{ color: 'var(--color-text-secondary)' }}>
            No se encontraton los reclamos con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div>
          {complaints.map((complaint) => (
            <div
              key={complaint.id}
              style={{
                padding: 'var(--space-6)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
              }}              
            >
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                }}                
              >
                {complaint.title}
              </h2>

              <p>
                <strong>Descripción:</strong>{' '}
                {complaint.description}
              </p>

              <p>
                <strong>Categoría:</strong>{' '}
                {CATEGORY_LABELS[complaint.category] ??
                  complaint.category}
              </p>

              <p>
                <strong>Estado:</strong>{' '}
                {STATUS_LABELS[complaint.status] ??
                  complaint.status}
              </p>

              <p>
                <strong>Pasajero:</strong>{' '}
                {complaint.passengerId}
              </p>

              <p>
                <strong>Bus:</strong>{' '}
                {complaint.busId ?? 'No especificado'}
              </p>

              <p>
                <strong>Ruta:</strong>{' '}
                {complaint.routeId ?? 'No especificada'}
              </p>

              {complaint.adminResponse && (
                <p>
                  <strong>Respuesta del administrador:</strong>{' '}
                  {complaint.adminResponse}
                </p>
              )}

              <p
                style={{
                  color: 'var(--color-text-secondary)',
                }}
              >
                <strong>Creado:</strong>{' '}
                {new Date(complaint.createdAt).toLocaleString()}
              </p>
            </div>              
          ))}
        </div>
      )}
    </div>
  );
}
