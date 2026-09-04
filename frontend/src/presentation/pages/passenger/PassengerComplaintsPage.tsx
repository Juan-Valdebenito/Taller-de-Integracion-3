import { useMemo, useState } from 'react';

type PassengerComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED';

interface PassengerComplaint {
  id: string;
  title: string;
  createdAt: string;
  status: PassengerComplaintStatus;
}

const STATUS_LABELS: Record<PassengerComplaintStatus, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revision',
  RESOLVED: 'Resuelto',
};

const STATUS_COLORS: Record<PassengerComplaintStatus, string> = {
  PENDING: 'hsl(38,92%,50%)',
  IN_REVIEW: 'hsl(215,80%,55%)',
  RESOLVED: 'hsl(142,71%,45%)',
};

const MOCK_COMPLAINTS: PassengerComplaint[] = [
  {
    id: 'pc-1',
    title: 'La micro no se detuvo en mi paradero',
    createdAt: '23/08/2026 09:10',
    status: 'PENDING',
  },
  {
    id: 'pc-2',
    title: 'Retraso de 35 minutos en hora punta',
    createdAt: '22/08/2026 18:40',
    status: 'IN_REVIEW',
  },
  {
    id: 'pc-3',
    title: 'Mala ventilacion en bus de ruta 301',
    createdAt: '20/08/2026 14:05',
    status: 'RESOLVED',
  },
];

function Badge({ status }: { status: PassengerComplaintStatus }) {
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

export function PassengerComplaintsPage() {
  const [complaints, setComplaints] = useState<PassengerComplaint[]>(MOCK_COMPLAINTS);

  const stats = useMemo(
    () => ({
      total: complaints.length,
      pending: complaints.filter((c) => c.status === 'PENDING').length,
      resolved: complaints.filter((c) => c.status === 'RESOLVED').length,
    }),
    [complaints],
  );

  const simulateProgress = () => {
    setComplaints((prev) => {
      const idx = prev.findIndex((c) => c.status === 'PENDING');
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = { ...next[idx], status: 'IN_REVIEW' };
      return next;
    });
  };

  return (
    <div style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: 0 }}>
        Mis reclamos
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
          Vista simulada para validar flujo visual mientras se termina la API.
        </p>
      </div>

      <div
        style={{
          background: 'linear-gradient(135deg, hsla(200,95%,47%,0.16), hsla(160,84%,39%,0.14))',
          border: '1px solid hsla(200,95%,47%,0.35)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>Modo simulacion activo</p>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Total: {stats.total} | Pendientes: {stats.pending} | Resueltos: {stats.resolved}
          </p>
        </div>
        <button
          onClick={simulateProgress}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid hsla(200,95%,47%,0.35)',
            background: 'var(--color-surface-1)',
            color: 'var(--color-text-primary)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Simular avance de un reclamo
        </button>
      </div>

      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--color-surface-2)' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reclamo</th>
              <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha</th>
              <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((complaint) => (
              <tr key={complaint.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{complaint.title}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{complaint.createdAt}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <Badge status={complaint.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
