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
  tripId: string | null;
  createdAt: string;
  updatedAt: string;
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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

      const response = await apiClient.get<Complaint[]>(`/complaints/my-complaints${query ? `?${query}` : ''}`);

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

      const response = await apiClient.post<Complaint>(
        '/complaints',
        {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          companyId: 'company-demo',
        },
      );

      const newComplaint = response.data;

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

        <button type="button" onClick={() => { setShowForm(true); setError(null); setSuccess(null);}}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
          }}>
          + Crear reclamo
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
        <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-background-secondary)', }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)', }}>
            Nuevo reclamo
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <label
              htmlFor="complaint-title"
              style={{
                display: 'block',
                marginBottom: 'var(--space-2)',
                fontWeight: 600,
              }}
              >
                Titulo:
              </label>
              <input
                id="complaint-title"
                type="text"
                value={form.title}
                onChange={(event) => setForm({...form, title: event.target.value})}
                placeholder="Titulo del reclamo"
                disabled={isSubmitting}
                style={{
                  width: '50%',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="complaint-category"
                style={{
                  display: 'block',
                  marginBottom: 'var(--space-2)',
                  fontWeight: 600,
                }}
              >
                Categoria:
              </label>
              <select
                id="complaint-category"
                value={form.category}
                onChange={(event) => setForm({...form, category: event.target.value})}
                disabled={isSubmitting}
                style={{
                  width: '50%',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxSizing: 'border-box',

                }}
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
              <label
                htmlFor="complaint-description"
                style={{
                  display: 'block',
                  marginBottom: 'var(--space-2)',
                  fontWeight: 600,
                }}
              >
                Descripcion
              </label>

              <textarea
                id="complaint-description"
                value={form.description}
                onChange={(event) => setForm({...form, description: event.target.value})}
                placeholder="Describa su reclamo"
                rows={5}
                disabled={isSubmitting}
                style={{
                  width: '50%',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button 
              type="submit" 
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              >
                {isSubmitting ? 'Enviando...' : 'Enviar reclamo'}
              </button>

              <button 
              type="button" 
              onClick={() => { setShowForm(false); setForm(initialForm); setError(null); }}
              style={{
                padding: 'var(--space-3) var(--space-5)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              >
                Cancelar
              </button>
            </div>

          </form>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        gap: 'var(--space-4)', 
        marginBottom: 'var(--space-6)', 
        flexWrap: 'wrap', 
        padding: 'var(--space-5)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        }}
        >
        <div>
          <label>
            Categorias:
          </label>

          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-2)', }}>
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
          <label>
            Estados:
          </label>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--space-2)', }}>
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="IN_REVIEW">En revisión</option>
            <option value="RESOLVED">Resuelto</option>
            <option value="REJECTED">Rechazado</option>
          </select>
        </div>
      </div>

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