/** Página de reclamos del pasajero - Por implementar */
import { useEffect, useState } from 'react';
import { apiClient } from '../../../infrastructure/api/apiClient';

interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
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

const initialForm = {
  title: '',
  description: '',
  category: ''
};

export function PassengerComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);

  const loadComplaints = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get<ComplaintsResponse>('/complaints/my',);

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
      setError(null);

      const response = await apiClient.post<{ data: Complaint}>(
        '/complaints',
        {
          title: form.title,
          description: form.description,
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
    } catch (err) {
      console.error('Error al crear el reclamo:', err);
      setError('No se puede crear el reclamo');
    }
  };

  // Cargando los reclamos

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
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

        <button type="button" onClick={() => { setShowForm(true); setError(null);}}>
          Crear reclamo
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', background: 'var(--color-background-secondary)', }}>
          {error}
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
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label>
                Categoria:
              </label>
              <select
                value={form.category}
                onChange={(event) => setForm({...form, category: event.target.value})}
              >
                <option value="">Seleccionar categoría</option>
                <option value="DRIVER">Conductor</option>
                <option value="VEHICLE">Vehículo</option>
                <option value="ROUTE">Ruta</option>
                <option value="SERVICE">Servicio</option>
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
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <button type="submit">
                Enviar reclamo
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
                  {complaint.category}
                </p>

                <p>
                  <strong>Estado:</strong>{' '}
                  {complaint.status}
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
