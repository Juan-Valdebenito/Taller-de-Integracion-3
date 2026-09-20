import { useMemo, useState } from 'react';

type CompanyComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED';

interface CompanyComplaint {
  id: string;
  passengerName: string;
  title: string;
  route: string;
  status: CompanyComplaintStatus;
}

type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

interface DriverIncident {
  id: string;
  driverName: string;
  busUnit: string;
  route: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  timestamp: string;
}

const MOCK_COMPANY_COMPLAINTS: CompanyComplaint[] = [
  { id: 'cc-1', passengerName: 'Maria G.', title: 'Conductor no respeto parada', route: '101 Centro - Las Condes', status: 'PENDING' },
  { id: 'cc-2', passengerName: 'Juan P.', title: 'Bus con sobrecupo en hora peak', route: '209 Maipu - Providencia', status: 'IN_REVIEW' },
  { id: 'cc-3', passengerName: 'Carla M.', title: 'Aire acondicionado no funcionaba', route: '301 Puente Alto - Centro', status: 'RESOLVED' },
];

const MOCK_DRIVER_INCIDENTS: DriverIncident[] = [
  {
    id: 'inc-1',
    driverName: 'Sergio S.',
    busUnit: '1-C',
    route: '101 - Av. Alemania',
    title: 'Falla mecánica en motor',
    description: 'El bus presentó una falla en el motor que provocó que se detuviera en medio de la ruta.',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    timestamp: '10:45 AM',
  },
  {
    id: 'inc-2',
    driverName: 'Esteban Q.',
    busUnit: '9-D',
    route: '209 - Los Poetas',
    title: 'Colisión menor con vehiculo particular',
    description: 'Tercero rozó el costado del bus en semáforo. Sin lesionados.',
    severity: 'MEDIUM',
    status: 'OPEN',
    timestamp: '13:30 PM',
  },
  {
    id: 'inc-3',
    driverName: 'Armando P.',
    busUnit: '1-B',
    route: '127 - Padre Las Casas',
    title: 'Desvío por marcha en la vía',
    description: 'Carabineros desviaron la ruta principal hacia calle secundaria.',
    severity: 'LOW',
    status: 'CLOSED',
    timestamp: '08:30 AM',
  }
]

const STATUS_LABELS: Record<CompanyComplaintStatus, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revision',
  RESOLVED: 'Resuelto',
};

const STATUS_COLORS: Record<CompanyComplaintStatus, string> = {
  PENDING: 'hsl(38,92%,50%)',
  IN_REVIEW: 'hsl(215,80%,55%)',
  RESOLVED: 'hsl(142,71%,45%)',
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica'
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: 'hsl(215,80%,55%)',
  MEDIUM: 'hsl(38,92%,50%)',
  HIGH: 'hsl(12,85%,55%)',
  CRITICAL: 'hsl(0,84%,60%)',
};

function StatusPill({ status }: { status: CompanyComplaintStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 700,
        background: `${color}18`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function SeverityPill({ severity} : { severity: IncidentSeverity}) {
  const color = SEVERITY_COLORS[severity];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 700,
        background: `${color}18`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function CompanyComplaintsPage() {
  const [activeTab, setActiveTab] = useState<'complaints' | 'incidents'>('complaints');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompanyComplaintStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | 'ALL'>('ALL');

  const [complaints, setComplaints] = useState<CompanyComplaint[]>(MOCK_COMPANY_COMPLAINTS);
  const [incidents, setIncidents] = useState<DriverIncident[]>(MOCK_DRIVER_INCIDENTS);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      const matchesStatus = statusFilter == 'ALL' || item.status === statusFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
      item.passengerName.toLowerCase().includes(term) ||
      item.title.toLowerCase().includes(term) ||
      item.route.toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
    });
  }, [complaints, statusFilter, searchTerm]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((item) => {
      const matchesSeverity = severityFilter == 'ALL' || item.severity === severityFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
      item.driverName.toLowerCase().includes(term) ||
      item.title.toLowerCase().includes(term) ||
      item.busUnit.toLowerCase().includes(term) ||
      item.route.toLowerCase().includes(term);

    return matchesSeverity && matchesSearch;
    });
  }, [incidents, severityFilter, searchTerm]);

  const simulateResolveFirstComplaint = () => {
    setComplaints((prev) => {
      const idx = prev.findIndex((item) => item.status !== 'RESOLVED');
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = { ...next[idx], status: 'RESOLVED' };
      return next;
    });
  };

  const simulateCloseFirstIncident = () => {
    setIncidents((prev) => {
      const idx = prev.findIndex((item) => item.status !== 'CLOSED');
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = { ...next[idx], status: 'CLOSED' };
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
          Centro de Control y Monitoreo
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Panel simulado para validar visualmente el flujo de gestion de reclamos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setActiveTab('complaints')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            border: 'none',
            borderBottom: activeTab === 'complaints' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'transparent',
            fontWeight: activeTab === 'complaints' ? 700 : 500,
            color: activeTab === 'complaints' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          Reclamos de pasajeros ({complaints.length})
        </button>

        <button
          onClick={() => setActiveTab('incidents')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            border: 'none',
            borderBottom: activeTab === 'incidents' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'transparent',
            fontWeight: activeTab === 'incidents' ? 700 : 500,
            color: activeTab === 'incidents' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          Incidentes de conductores ({incidents.length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={activeTab === 'complaints' ? 'Buscar pasajero, título o ruta...' : 'Buscar conductor, unidad o detalle...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 250px',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-1)',
              color: 'var(--color-text-primary)',
            }}
          />

          {activeTab == 'complaints' ? (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CompanyComplaintStatus | 'ALL')}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-1)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="ALL">Todos los estados</option>
                <option value="PENDING">Pendiente</option>
                <option value="IN_REVIEW">En revision</option>
                <option value="RESOLVED">Resuelto</option>
              </select>

              <button
                onClick={simulateResolveFirstComplaint}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid hsl(142,71%,45%)',
                  background: 'hsla(142,71%,45%,0.12)',
                  color: 'hsl(142,71%,45%)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Simular resolucion
              </button>
            </>
          ) : (
            <>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as IncidentSeverity | 'ALL')}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-1)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="ALL">Todas las severidades</option>
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
              </select>

              <button
                onClick={simulateCloseFirstIncident}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid hsl(215,80%,55%)',
                  background: 'hsla(215,80%,55%,0.12)',
                  color: 'hsl(215,80%,55%)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Simular cierre del primer incidente
              </button>
            </>
          )}
      </div>

      {activeTab === 'complaints' && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--color-surface-2)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Pasajero</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Reclamo</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Ruta</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredComplaints.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No se encontraron reclamos que coincidan con la busqueda.
                  </td>
                </tr>
              ) : (
                filteredComplaints.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.passengerName}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)' }}>{item.title}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)' }}>{item.route}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <StatusPill status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Mostrando {filteredComplaints.length} de {complaints.length} reclamos registrados.
          </div>
        </div>
      )}

      {activeTab === 'incidents' && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--color-surface-2)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Conductor / Unidad</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Evento</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Ruta / Hora</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Severidad</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No se encontraron incidentes que coincidan con la busqueda.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)'}}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.driverName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.busUnit}</div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)'}}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.description}</div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)'}}>
                      <div style={{ color: 'var(--color-text-secondary)' }}>{item.route}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.timestamp}</div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <SeverityPill severity={item.severity} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Mostrando {filteredIncidents.length} de {incidents.length} incidentes registrados.
          </div>
        </div>
      )}
    </div>
  );
}
