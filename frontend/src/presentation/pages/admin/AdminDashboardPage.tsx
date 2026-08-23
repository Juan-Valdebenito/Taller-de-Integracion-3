// ── Tipos ────────────────────────────────────────────────────
interface KPI {
  label: string;
  value: string | number;
  icon: string;
  trend: string;
  trendUp: boolean;
  color: string;
}

interface RecentComplaint {
  id: string;
  title: string;
  category: string;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  passenger: string;
  company: string;
  createdAt: string;
}

interface ActiveBus {
  id: string;
  patente: string;
  route: string;
  company: string;
  passengers: number;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  speed: number;
}

// ── Mock Data ────────────────────────────────────────────────
const KPIS: KPI[] = [
  { label: 'Empresas Registradas', value: 12, icon: '🏢', trend: '+2 este mes', trendUp: true, color: 'hsl(215,80%,46%)' },
  { label: 'Usuarios Totales', value: '1,847', icon: '👥', trend: '+134 este mes', trendUp: true, color: 'hsl(199,89%,48%)' },
  { label: 'Rutas Activas', value: 48, icon: '🗺️', trend: '+3 este mes', trendUp: true, color: 'hsl(142,71%,45%)' },
  { label: 'Micros en Servicio', value: 213, icon: '🚍', trend: '-5 en mant.', trendUp: false, color: 'hsl(38,92%,50%)' },
  { label: 'Reclamos Pendientes', value: 27, icon: '📋', trend: '+8 hoy', trendUp: false, color: 'hsl(0,84%,60%)' },
  { label: 'Pasajeros Hoy', value: '42,318', icon: '🧑‍🤝‍🧑', trend: '+12% vs ayer', trendUp: true, color: 'hsl(271,70%,60%)' },
];

const RECENT_COMPLAINTS: RecentComplaint[] = [
  { id: 'c1', title: 'Cobro excesivo de pasaje', category: 'DRIVER_BEHAVIOR', status: 'PENDING', passenger: 'María González', company: 'Buses Metropolitanos', createdAt: '2026-08-23 09:14' },
  { id: 'c2', title: 'Micro llena en hora peak', category: 'OVERCROWDING', status: 'IN_REVIEW', passenger: 'Juan Perez', company: 'Trans Oriente', createdAt: '2026-08-23 08:50' },
  { id: 'c3', title: 'Retraso de más de 40 minutos', category: 'DELAY', status: 'PENDING', passenger: 'Carla Muñoz', company: 'Buses del Sur', createdAt: '2026-08-23 07:30' },
  { id: 'c4', title: 'Mal estado de vehículo', category: 'VEHICLE_CONDITION', status: 'RESOLVED', passenger: 'Pedro Soto', company: 'Buses Metropolitanos', createdAt: '2026-08-22 18:22' },
  { id: 'c5', title: 'Conductor irrespetuoso', category: 'DRIVER_BEHAVIOR', status: 'REJECTED', passenger: 'Ana Vargas', company: 'Trans Norte', createdAt: '2026-08-22 16:45' },
];

const ACTIVE_BUSES: ActiveBus[] = [
  { id: 'b1', patente: 'BGPK-45', route: '101 · Centro–Las Condes', company: 'Buses Metropolitanos', passengers: 38, capacity: 40, status: 'ACTIVE', speed: 42 },
  { id: 'b2', patente: 'CRTM-12', route: '209 · Maipú–Providencia', company: 'Trans Oriente', passengers: 22, capacity: 40, status: 'ACTIVE', speed: 58 },
  { id: 'b3', patente: 'HFJZ-88', route: '301 · Puente Alto–Centro', company: 'Buses del Sur', passengers: 40, capacity: 40, status: 'ACTIVE', speed: 0 },
  { id: 'b4', patente: 'KLWQ-33', route: '115 · Peñalolén–Buin', company: 'Buses Metropolitanos', passengers: 0, capacity: 40, status: 'MAINTENANCE', speed: 0 },
  { id: 'b5', patente: 'MXPN-77', route: '450 · Quilicura–Pudahuel', company: 'Trans Norte', passengers: 15, capacity: 40, status: 'ACTIVE', speed: 65 },
];

const COMPANY_STATS = [
  { name: 'Buses Metropolitanos', buses: 87, routes: 18, complaints: 12, share: 41 },
  { name: 'Trans Oriente', buses: 54, routes: 11, complaints: 7, share: 25 },
  { name: 'Buses del Sur', buses: 42, routes: 9, complaints: 5, share: 20 },
  { name: 'Trans Norte', buses: 30, routes: 10, complaints: 3, share: 14 },
];

// ── Helpers ──────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  RESOLVED: 'Resuelto',
  REJECTED: 'Rechazado',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'hsl(38,92%,50%)',
  IN_REVIEW: 'hsl(215,80%,55%)',
  RESOLVED: 'hsl(142,71%,45%)',
  REJECTED: 'hsl(0,84%,60%)',
};

const BUS_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'hsl(142,71%,45%)',
  INACTIVE: 'hsl(220,10%,50%)',
  MAINTENANCE: 'hsl(38,92%,50%)',
};

const BUS_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  MAINTENANCE: 'Mantenimiento',
};

function getOccupancyColor(passengers: number, capacity: number) {
  const pct = passengers / capacity;
  if (pct >= 1) return 'hsl(0,84%,60%)';
  if (pct >= 0.8) return 'hsl(24,95%,53%)';
  if (pct >= 0.5) return 'hsl(38,92%,50%)';
  return 'hsl(142,71%,45%)';
}

// ── Componentes internos ─────────────────────────────────────
function KpiCard({ kpi }: { kpi: KPI }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px rgba(0,0,0,0.4)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Background accent */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: kpi.color, opacity: 0.06, borderRadius: '0 0 0 80px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {kpi.label}
          </p>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: 'var(--space-1)', letterSpacing: '-0.02em' }}>
            {kpi.value}
          </p>
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: `${kpi.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
          {kpi.icon}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '10px', color: kpi.trendUp ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {kpi.trendUp ? '▲' : '▼'}
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{kpi.trend}</span>
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: 'var(--radius-full)',
      fontSize: '11px',
      fontWeight: 600,
      background: `${color}18`,
      color,
      border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

// ── Página principal ─────────────────────────────────────────
export function AdminDashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
          Panel de Control
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
          Visión global del sistema — Sábado 23 de agosto, 2026
        </p>
      </div>

      {/* KPIs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        {KPIS.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      {/* Row: Empresa stats + Recent complaints */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 'var(--space-6)' }}>

        {/* Company bars */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, marginBottom: 'var(--space-5)', color: 'var(--color-text-primary)' }}>
            🏢 Distribución de Flota por Empresa
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {COMPANY_STATS.map((c) => (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{c.name}</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.buses} micros</span>
                </div>
                <div style={{ height: '8px', background: 'var(--color-surface-3)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${c.share}%`,
                    background: 'linear-gradient(90deg, var(--color-primary-500), hsl(199,89%,48%))',
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-1)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{c.routes} rutas</span>
                  <span style={{ fontSize: '11px', color: 'hsl(0,84%,60%)' }}>{c.complaints} reclamos</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent complaints */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              📋 Reclamos Recientes
            </h2>
            <a href="/admin/complaints" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-400)', textDecoration: 'none', fontWeight: 600 }}>
              Ver todos →
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {RECENT_COMPLAINTS.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', transition: 'background var(--transition-fast)' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.title}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {c.passenger} · {c.company}
                  </p>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <Badge label={STATUS_LABELS[c.status]} color={STATUS_COLORS[c.status]} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active buses table */}
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            🚍 Micros en Servicio (Tiempo Real)
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-success)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            En vivo
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Patente', 'Ruta', 'Empresa', 'Aforo', 'Velocidad', 'Estado'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIVE_BUSES.map((bus) => {
                const pct = Math.round((bus.passengers / bus.capacity) * 100);
                const occColor = getOccupancyColor(bus.passengers, bus.capacity);
                return (
                  <tr key={bus.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background var(--transition-fast)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: 'var(--space-3)', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-primary-300)' }}>
                      {bus.patente}
                    </td>
                    <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bus.route}
                    </td>
                    <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                      {bus.company}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{ width: '60px', height: '6px', background: 'var(--color-surface-3)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: occColor, borderRadius: 'var(--radius-full)' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: occColor, fontWeight: 600 }}>{bus.passengers}/{bus.capacity}</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {bus.status === 'ACTIVE' ? `${bus.speed} km/h` : '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <Badge label={BUS_STATUS_LABELS[bus.status]} color={BUS_STATUS_COLORS[bus.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* System alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {[
          { icon: '⚠️', color: 'hsl(38,92%,50%)', title: '5 micros en mantenimiento', desc: 'Buses HFJZ-88, KLWQ-33 y 3 más necesitan atención técnica' },
          { icon: '🔴', color: 'hsl(0,84%,60%)', title: '27 reclamos sin atender', desc: '8 nuevos hoy — 3 llevan más de 72h sin respuesta' },
          { icon: '📈', color: 'hsl(142,71%,45%)', title: 'Peak matutino superado', desc: 'Aforo promedio sistema: 74%. Flujo normalizado' },
        ].map((alert) => (
          <div key={alert.title} style={{
            background: `${alert.color}0d`,
            border: `1px solid ${alert.color}33`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            display: 'flex',
            gap: 'var(--space-3)',
          }}>
            <span style={{ fontSize: '1.3rem' }}>{alert.icon}</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: alert.color }}>{alert.title}</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{alert.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
