import { useMemo, useState } from 'react';

type CompanyComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED';

interface CompanyComplaint {
  id: string;
  passengerName: string;
  title: string;
  route: string;
  status: CompanyComplaintStatus;
}

const MOCK_COMPANY_COMPLAINTS: CompanyComplaint[] = [
  { id: 'cc-1', passengerName: 'Maria G.', title: 'Conductor no respeto parada', route: '101 Centro - Las Condes', status: 'PENDING' },
  { id: 'cc-2', passengerName: 'Juan P.', title: 'Bus con sobrecupo en hora peak', route: '209 Maipu - Providencia', status: 'IN_REVIEW' },
  { id: 'cc-3', passengerName: 'Carla M.', title: 'Aire acondicionado no funcionaba', route: '301 Puente Alto - Centro', status: 'RESOLVED' },
];

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

export function CompanyComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<CompanyComplaintStatus | 'ALL'>('ALL');
  const [items, setItems] = useState<CompanyComplaint[]>(MOCK_COMPANY_COMPLAINTS);

  const filtered = useMemo(
    () => items.filter((item) => statusFilter === 'ALL' || item.status === statusFilter),
    [items, statusFilter],
  );

  const simulateResolveFirst = () => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.status !== 'RESOLVED');
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = { ...next[idx], status: 'RESOLVED' };
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Reclamos</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Panel simulado para validar visualmente el flujo de gestion de reclamos.</p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
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
          onClick={simulateResolveFirst}
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
      </div>

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
            {filtered.map((item) => (
              <tr key={item.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.passengerName}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)' }}>{item.title}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)' }}>{item.route}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <StatusPill status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
          Mostrando {filtered.length} de {items.length} reclamos simulados
        </div>
      </div>
    </div>
  );
}
