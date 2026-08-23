import { useState, useMemo } from 'react';

// ── Tipos ─────────────────────────────────────────────────────
type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
type ComplaintCategory = 'DELAY' | 'OVERCROWDING' | 'DRIVER_BEHAVIOR' | 'VEHICLE_CONDITION' | 'ACCESSIBILITY' | 'OTHER';

interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  passenger: string;
  passengerEmail: string;
  company: string;
  route: string | null;
  bus: string | null;
  adminResponse: string | null;
  createdAt: string;
}

// ── Mock Data ─────────────────────────────────────────────────
const MOCK_COMPLAINTS: Complaint[] = [
  { id: 'cl1', title: 'Cobro excesivo de pasaje', description: 'El conductor me cobró el doble del pasaje sin justificación alguna. Intenté hablar con él pero fue grosero.', category: 'DRIVER_BEHAVIOR', status: 'PENDING', passenger: 'María González', passengerEmail: 'maria.g@gmail.com', company: 'Buses Metropolitanos', route: '101 – Centro–Las Condes', bus: 'BGPK-45', adminResponse: null, createdAt: '2026-08-23 09:14' },
  { id: 'cl2', title: 'Micro llena en hora peak', description: 'La micro venía absolutamente repleta a las 8:30am. No fue posible abordar y el siguiente no llegó en 30 min.', category: 'OVERCROWDING', status: 'IN_REVIEW', passenger: 'Juan Perez', passengerEmail: 'juan.p@gmail.com', company: 'Trans Oriente', route: '209 – Maipú–Providencia', bus: 'CRTM-12', adminResponse: 'Estamos revisando el incidente con el supervisor de ruta.', createdAt: '2026-08-23 08:50' },
  { id: 'cl3', title: 'Retraso de más de 40 minutos', description: 'Esperé más de 40 minutos en el paradero Av. Grecia con Irarrázaval. La app marcaba que llegaría en 5 minutos.', category: 'DELAY', status: 'PENDING', passenger: 'Carla Muñoz', passengerEmail: 'carla.munoz@gmail.com', company: 'Buses del Sur', route: '301 – Puente Alto–Centro', bus: null, adminResponse: null, createdAt: '2026-08-23 07:30' },
  { id: 'cl4', title: 'Mal estado del vehículo', description: 'Los asientos estaban rotos, había vidrios sucios y el sistema de ventilación no funcionaba en pleno verano.', category: 'VEHICLE_CONDITION', status: 'RESOLVED', passenger: 'Pedro Soto', passengerEmail: 'pedro.soto@gmail.com', company: 'Buses Metropolitanos', route: '101 – Centro–Las Condes', bus: 'BGPK-45', adminResponse: 'El vehículo fue enviado a mantenimiento preventivo. Gracias por el reporte.', createdAt: '2026-08-22 18:22' },
  { id: 'cl5', title: 'Conductor irrespetuoso', description: 'El conductor se negó a esperar a una señora mayor que venía corriendo hacia el paradero y le cerró las puertas en la cara.', category: 'DRIVER_BEHAVIOR', status: 'REJECTED', passenger: 'Ana Vargas', passengerEmail: 'ana.vargas@gmail.com', company: 'Trans Norte', route: '450 – Quilicura–Pudahuel', bus: 'MXPN-77', adminResponse: 'Según el protocolo, el conductor no estaba obligado a esperar. Sin embargo, hemos conversado con él sobre el trato.', createdAt: '2026-08-22 16:45' },
  { id: 'cl6', title: 'Sin acceso para silla de ruedas', description: 'La micro no tenía rampa de acceso operativa. Tuve que esperar 3 micros más para poder abordar.', category: 'ACCESSIBILITY', status: 'PENDING', passenger: 'Roberto Díaz', passengerEmail: 'roberto.d@gmail.com', company: 'Buses del Sur', route: '301 – Puente Alto–Centro', bus: null, adminResponse: null, createdAt: '2026-08-22 14:10' },
  { id: 'cl7', title: 'Chofer con celular al volante', description: 'El conductor estuvo usando el celular durante varios kilómetros en plena Autopista Central. Es un riesgo grave.', category: 'DRIVER_BEHAVIOR', status: 'IN_REVIEW', passenger: 'Lucía Herrera', passengerEmail: 'lucia.h@gmail.com', company: 'Trans Oriente', route: '209 – Maipú–Providencia', bus: 'CRTM-12', adminResponse: 'Se ha iniciado una investigación interna.', createdAt: '2026-08-21 12:05' },
  { id: 'cl8', title: 'No se detuvo en paradero', description: 'La micro pasó de largo sin detenerse en el paradero de Av. Larraín 1234 donde esperaban varias personas.', category: 'OTHER', status: 'RESOLVED', passenger: 'Sofía Pinto', passengerEmail: 'sofia.p@gmail.com', company: 'Express Cordillera', route: '200 – La Reina–Centro', bus: null, adminResponse: 'El paradero fue habilitado correctamente. Disculpe los inconvenientes.', createdAt: '2026-08-21 09:30' },
];

// ── Helpers ───────────────────────────────────────────────────
const STATUS_LABELS: Record<ComplaintStatus, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelto',
  REJECTED: 'Rechazado',
};

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  PENDING: 'hsl(38,92%,50%)',
  IN_REVIEW: 'hsl(215,80%,55%)',
  RESOLVED: 'hsl(142,71%,45%)',
  REJECTED: 'hsl(0,84%,60%)',
};

const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  DELAY: '⏰ Retraso',
  OVERCROWDING: '👥 Sobrecupo',
  DRIVER_BEHAVIOR: '🚨 Conducta',
  VEHICLE_CONDITION: '🔧 Vehículo',
  ACCESSIBILITY: '♿ Accesibilidad',
  OTHER: '📌 Otro',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

// ── Detail Modal ──────────────────────────────────────────────
interface DetailModalProps {
  complaint: Complaint;
  onClose: () => void;
  onUpdateStatus: (id: string, status: ComplaintStatus, response: string) => void;
}

function ComplaintDetailModal({ complaint, onClose, onUpdateStatus }: DetailModalProps) {
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status);
  const [response, setResponse] = useState(complaint.adminResponse ?? '');

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--space-4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', width: '600px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        {/* Modal header */}
        <div style={{ padding: 'var(--space-6) var(--space-8)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-1)' }}>
              {CATEGORY_LABELS[complaint.category]}
            </p>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-text-primary)' }}>{complaint.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 'var(--space-1)' }}>✕</button>
        </div>

        <div style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Meta info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              { label: 'Pasajero', value: complaint.passenger },
              { label: 'Email', value: complaint.passengerEmail },
              { label: 'Empresa', value: complaint.company },
              { label: 'Ruta', value: complaint.route ?? '—' },
              { label: 'Micro', value: complaint.bus ?? '—' },
              { label: 'Fecha', value: complaint.createdAt },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>{label}</p>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>Descripción del reclamo</p>
            <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', borderLeft: `3px solid ${STATUS_COLORS[complaint.status]}` }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>{complaint.description}</p>
            </div>
          </div>

          {/* Admin response + status change */}
          <div>
            <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>Gestión del administrador</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Nuevo estado</label>
                <select
                  id="complaint-status-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
                  style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
                >
                  <option value="PENDING">Pendiente</option>
                  <option value="IN_REVIEW">En revisión</option>
                  <option value="RESOLVED">Resuelto</option>
                  <option value="REJECTED">Rechazado</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginBottom: 'var(--space-1)' }}>Respuesta al pasajero</label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={4}
                  placeholder="Escribe una respuesta para el pasajero..."
                  style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: 'var(--space-4) var(--space-8)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-3)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
            Cerrar
          </button>
          <button
            id="complaint-save-btn"
            onClick={() => { onUpdateStatus(complaint.id, status, response); onClose(); }}
            style={{ flex: 2, padding: 'var(--space-3)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' }}
          >
            💾 Guardar respuesta
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>(MOCK_COMPLAINTS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'ALL'>('ALL');
  const [selected, setSelected] = useState<Complaint | null>(null);

  const filtered = useMemo(() => complaints.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.passenger.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchCat = categoryFilter === 'ALL' || c.category === categoryFilter;
    return matchSearch && matchStatus && matchCat;
  }), [complaints, search, statusFilter, categoryFilter]);

  const handleUpdate = (id: string, status: ComplaintStatus, response: string) => {
    setComplaints((prev) => prev.map((c) => c.id === id ? { ...c, status, adminResponse: response } : c));
  };

  const counts = {
    PENDING: complaints.filter((c) => c.status === 'PENDING').length,
    IN_REVIEW: complaints.filter((c) => c.status === 'IN_REVIEW').length,
    RESOLVED: complaints.filter((c) => c.status === 'RESOLVED').length,
    REJECTED: complaints.filter((c) => c.status === 'REJECTED').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Reclamos del Sistema</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
          Gestión centralizada de quejas y denuncias de los usuarios
        </p>
      </div>

      {/* Status summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
        {(Object.entries(counts) as [ComplaintStatus, number][]).map(([status, count]) => (
          <button
            key={status}
            id={`filter-${status.toLowerCase()}`}
            onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
            style={{
              padding: 'var(--space-4)', background: statusFilter === status ? `${STATUS_COLORS[status]}18` : 'var(--color-surface-1)',
              border: `1px solid ${statusFilter === status ? STATUS_COLORS[status] + '44' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)',
            }}
          >
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: STATUS_COLORS[status] }}>{count}</p>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{STATUS_LABELS[status]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            id="complaint-search-input"
            type="text"
            placeholder="Buscar por título, pasajero o empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-10)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <select id="complaint-category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          <option value="ALL">Todas las categorías</option>
          {(Object.entries(CATEGORY_LABELS) as [ComplaintCategory, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead style={{ background: 'var(--color-surface-2)' }}>
              <tr>
                {['Reclamo', 'Categoría', 'Pasajero', 'Empresa', 'Fecha', 'Estado', 'Acción'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    No se encontraron reclamos
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--color-border)', transition: 'background var(--transition-fast)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: '200px' }}>
                      <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
                      {c.adminResponse && (
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>✍️ Con respuesta</p>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {CATEGORY_LABELS[c.category]}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '13px' }}>{c.passenger}</p>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{c.passengerEmail}</p>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '12px' }}>{c.company}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.createdAt}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <Badge label={STATUS_LABELS[c.status]} color={STATUS_COLORS[c.status]} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <button
                        onClick={() => setSelected(c)}
                        style={{ padding: 'var(--space-2) var(--space-3)', background: 'hsla(215,80%,46%,0.1)', border: '1px solid hsla(215,80%,46%,0.3)', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary-400)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        👁 Gestionar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Mostrando {filtered.length} de {complaints.length} reclamos
          </span>
        </div>
      </div>

      {/* Detail modal */}
      {selected !== null && (
        <ComplaintDetailModal
          complaint={selected}
          onClose={() => setSelected(null)}
          onUpdateStatus={handleUpdate}
        />
      )}
    </div>
  );
}
