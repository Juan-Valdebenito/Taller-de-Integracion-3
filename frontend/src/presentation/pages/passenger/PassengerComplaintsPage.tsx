/** Página de reclamos del pasajero - Por implementar */
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

interface ComplaintsResponse {
  data: Complaint[];
}

interface ComplaintResponse {
  data: Complaint;
}

const initialForm = {
  title: '',
  description: '',
  category: ''
};

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

export function PassengerComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadComplaints = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = 
        await apiClient.get<ComplaintsResponse>('/complaints/my',);

      setComplaints(response.data.data);
    } catch (err) {
      console.error('Error al cargar los reclamos:', err);
      setError('Error al cargar los reclamos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim() || !form.description.trim() || !form.category) {
      setError('Complete todos los campos obligatorios');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const response = await apiClient.post<ComplaintResponse>(
        '/complaints',
        {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          companyId: 'company-demo',
        },
      );

      const newComplaint = response.data.data;

      setComplaints((current) => [
        newComplaint, 
        ...current,
      ]);

      setForm(initialForm);
      setShowForm(false);
      setSuccess('Reclamo creado exitosamente');
    } catch (err) {
      console.error('Error al crear el reclamo:', err);
      setError('No se puede crear el reclamo');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cargando los reclamos

  if (isLoading) {
    return (
      <div 
        style={{ 
          padding: 'var(--space-8)', 
          textAlign: 'center' 
        }}
      >
        <span style={{ fontSize: '3rem' }}>📋</span>

        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: 'var(--space-4) 0 var(--space-2)' }}>
          Mis Reclamos
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Cargando reclamos...
        </p>
      </div>
    );
  }

  // Pagina de reclamos

  return (
    <div style={{ padding: 'var(--space-8)' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', }} >
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700}}>
            📋 Mis Reclamos
          </h1>

          <p style={{ color: 'var(--color-text-secondary)' }}>
            Consulta y registra tus reclamos
          </p>
        </div>

        <button type="button" onClick={() => { setShowForm(true); setError(null); setSuccess(null);}}>
          Crear reclamo
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', background: 'var(--color-background-secondary)', }}>
          {error}
        </div>
      )}

      {success && (
         <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', background: 'var(--color-background-secondary)', }}>
          {success}
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)', }}>
            Nuevo reclamo
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label>
                Titulo:
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm({...form, title: event.target.value})}
                placeholder="Titulo del reclamo"
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label>
                Categoria:
              </label>
              <select
                value={form.category}
                onChange={(event) => setForm({...form, category: event.target.value})}
                disabled={isSubmitting}
              >
                <option value="">Seleccionar categoría</option>
                <option value="DELAY">Retraso</option>
                <option value="OVERCROWDING">Exceso de pasajeros</option>
                <option value="DRIVER_BEHAVIOR">Comportamiento del conductor</option>
                <option value="VEHICLE_CONDITION">Estado del vehículo</option>
                <option value="ACCESSIBILITY">Accesibilidad</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label>
                Descripcion
              </label>

              <textarea
                value={form.description}
                onChange={(event) => setForm({...form, description: event.target.value})}
                placeholder="Describa su reclamo"
                rows={5}
                disabled={isSubmitting}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar reclamo'}
              </button>

              <button type="button" onClick={() => { setShowForm(false); setForm(initialForm); setError(null); }}>
                Cancelar
              </button>
            </div>

          </form>
        </div>
      )} 

      {complaints.length === 0 ? (
         <div style={{ textAlign: 'center', padding: 'var(--space-8)', }}>
          <span style={{ fontSize: '3rem' }}>📭</span>
          <h2 style={{ marginTop: 'var(--space-4)', fontWeight: 600, }}>
            No tienes reclamos
          </h2>

          <p style={{ color: 'var(--color-text-secondary)', }}>
            Tus reclamos aparecceran aqui
          </p>
        </div>
      ) : (
        <div>
          {complaints.map((complaint) => (
            <div key={complaint.id} style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', }}>
                <h2 style={{ fontSize: 'var(--font-size-lg)',  fontWeight: 600, }}>
                  {complaint.title}
                </h2>

                <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)', }}>
                  {complaint.description}
                </p>

                <p>
                  <strong>Categoria:</strong>{' '}
                  {CATEGORY_LABELS[complaint.category] ?? complaint.category}
                </p>

                <p>
                <strong>Estado:</strong>{' '}
                {STATUS_LABELS[complaint.status] ??
                  complaint.status}
              </p>

                {complaint.adminResponse && (
                  <p>
                    <strong>Respuesta del administrador:</strong>{' '}
                    {complaint.adminResponse}
                  </p>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}