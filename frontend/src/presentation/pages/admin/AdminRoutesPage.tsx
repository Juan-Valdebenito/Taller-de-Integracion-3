import { useState, useMemo } from 'react';

// ── Tipos ─────────────────────────────────────────────────────
interface Stop {
  id: string;
  name: string;
  order: number;
  latitude: number;
  longitude: number;
}

interface Route {
  id: string;
  code: string;
  name: string;
  company: string;
  description: string;
  isActive: boolean;
  stops: Stop[];
  busesAssigned: number;
  createdAt: string;
}

// ── Mock Data ─────────────────────────────────────────────────
const MOCK_ROUTES: Route[] = [
  {
    id: 'r1', code: '101', name: 'Centro – Las Condes', company: 'Buses Metropolitanos', description: 'Ruta troncal que conecta el centro con Las Condes via Av. Apoquindo', isActive: true, busesAssigned: 12, createdAt: '2024-03-15',
    stops: [
      { id: 's1', name: 'Terminal Alameda', order: 1, latitude: -33.4489, longitude: -70.6693 },
      { id: 's2', name: 'Plaza Italia', order: 2, latitude: -33.4372, longitude: -70.6406 },
      { id: 's3', name: 'Providencia / Manuel Montt', order: 3, latitude: -33.4295, longitude: -70.6175 },
      { id: 's4', name: 'Av. Apoquindo / Estoril', order: 4, latitude: -33.4095, longitude: -70.5747 },
    ],
  },
  {
    id: 'r2', code: '209', name: 'Maipú – Providencia', company: 'Trans Oriente', description: 'Ruta expresa conectando Maipú con el sector de Providencia', isActive: true, busesAssigned: 8, createdAt: '2024-04-10',
    stops: [
      { id: 's5', name: 'Terminal Maipú', order: 1, latitude: -33.5169, longitude: -70.7714 },
      { id: 's6', name: 'Pudahuel Centro', order: 2, latitude: -33.4636, longitude: -70.7439 },
      { id: 's7', name: 'Autopista Central / Lo Prado', order: 3, latitude: -33.4480, longitude: -70.7172 },
      { id: 's8', name: 'Baquedano', order: 4, latitude: -33.4373, longitude: -70.6404 },
      { id: 's9', name: 'Salvador / Providencia', order: 5, latitude: -33.4297, longitude: -70.6265 },
    ],
  },
  {
    id: 'r3', code: '301', name: 'Puente Alto – Centro', company: 'Buses del Sur', description: 'Ruta que conecta Puente Alto con el centro pasando por Gran Avenida', isActive: true, busesAssigned: 15, createdAt: '2024-04-25',
    stops: [
      { id: 's10', name: 'Terminal Puente Alto', order: 1, latitude: -33.6104, longitude: -70.5777 },
      { id: 's11', name: 'La Florida / Vicuña Mackenna', order: 2, latitude: -33.5348, longitude: -70.5834 },
      { id: 's12', name: 'San Miguel Metro', order: 3, latitude: -33.4949, longitude: -70.6574 },
      { id: 's13', name: 'Plaza de Armas', order: 4, latitude: -33.4373, longitude: -70.6500 },
    ],
  },
  {
    id: 'r4', code: '115', name: 'Peñalolén – Buin', company: 'Buses Metropolitanos', description: 'Ruta interurbana que conecta Peñalolén con Buin', isActive: false, busesAssigned: 0, createdAt: '2024-05-05',
    stops: [
      { id: 's14', name: 'Peñalolén Norte', order: 1, latitude: -33.4850, longitude: -70.5478 },
      { id: 's15', name: 'La Pintana', order: 2, latitude: -33.5637, longitude: -70.6347 },
      { id: 's16', name: 'Buin Centro', order: 3, latitude: -33.7304, longitude: -70.7453 },
    ],
  },
  {
    id: 'r5', code: '450', name: 'Quilicura – Pudahuel', company: 'Trans Norte', description: 'Ruta que conecta Quilicura con Pudahuel via Ruta 68', isActive: true, busesAssigned: 5, createdAt: '2024-06-18',
    stops: [
      { id: 's17', name: 'Quilicura Centro', order: 1, latitude: -33.3548, longitude: -70.7358 },
      { id: 's18', name: 'Ruta 68 / Américo Vespucio', order: 2, latitude: -33.3972, longitude: -70.7639 },
      { id: 's19', name: 'Pudahuel Sur', order: 3, latitude: -33.4433, longitude: -70.7639 },
    ],
  },
  {
    id: 'r6', code: '200', name: 'La Reina – Centro', company: 'Express Cordillera', description: 'Servicio express desde La Reina al centro de Santiago', isActive: true, busesAssigned: 7, createdAt: '2024-08-01',
    stops: [
      { id: 's20', name: 'La Reina / Av. Larraín', order: 1, latitude: -33.4500, longitude: -70.5369 },
      { id: 's21', name: 'Ñuñoa / Irarrázaval', order: 2, latitude: -33.4572, longitude: -70.5969 },
      { id: 's22', name: 'Parque Bustamante', order: 3, latitude: -33.4437, longitude: -70.6272 },
      { id: 's23', name: 'Morandé / Moneda', order: 4, latitude: -33.4395, longitude: -70.6553 },
    ],
  },
];

const COMPANIES = ['Todas las empresas', 'Buses Metropolitanos', 'Trans Oriente', 'Buses del Sur', 'Trans Norte', 'Express Cordillera'];

// ── Helpers ───────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────
interface ModalProps {
  onClose: () => void;
  onSave: (data: Partial<Route>) => void;
  initial?: Partial<Route>;
}

function RouteModal({ onClose, onSave, initial }: ModalProps) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    company: initial?.company ?? 'Buses Metropolitanos',
    description: initial?.description ?? '',
    isActive: initial?.isActive ?? true,
  });
  const isEdit = !!initial?.id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '480px', maxWidth: '90vw', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>
          {isEdit ? '✏️ Editar Ruta' : '➕ Nueva Ruta'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Código</label>
              <input type="text" placeholder="101" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }} />
            </div>
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Nombre</label>
              <input type="text" placeholder="Centro – Las Condes" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Empresa</label>
            <select value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
              {COMPANIES.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Descripción</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descripción del recorrido..."
              style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', resize: 'vertical' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Ruta activa</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>Cancelar</button>
          <button
            id="route-modal-save-btn"
            onClick={() => { onSave(form); onClose(); }}
            style={{ flex: 2, padding: 'var(--space-3)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' }}>
            {isEdit ? 'Guardar cambios' : 'Crear ruta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────
function DeleteConfirm({ route, onClose, onConfirm }: { route: Route; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid hsla(0,84%,60%,0.3)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '380px', maxWidth: '90vw', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, marginBottom: 'var(--space-3)', color: 'hsl(0,84%,60%)' }}>⚠️ Eliminar Ruta</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
          ¿Estás seguro de que deseas eliminar la ruta <strong style={{ color: 'var(--color-text-primary)' }}>{route.code} – {route.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>Cancelar</button>
          <button
            id="route-delete-confirm-btn"
            onClick={() => { onConfirm(); onClose(); }}
            style={{ flex: 1, padding: 'var(--space-3)', background: 'hsl(0,84%,60%)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' }}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export function AdminRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>(MOCK_ROUTES);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('Todas las empresas');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | Route | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);

  const filtered = useMemo(() => routes.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.code.includes(search);
    const matchCompany = companyFilter === 'Todas las empresas' || r.company === companyFilter;
    const matchStatus = statusFilter === 'ALL' || (statusFilter === 'active' ? r.isActive : !r.isActive);
    return matchSearch && matchCompany && matchStatus;
  }), [routes, search, companyFilter, statusFilter]);

  const toggleActive = (id: string) => setRoutes((prev) => prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  const handleDelete = (id: string) => setRoutes((prev) => prev.filter((r) => r.id !== id));

  const handleSave = (data: Partial<Route>) => {
    if (modal === 'new') {
      const newRoute: Route = { id: `r${Date.now()}`, code: data.code ?? '', name: data.name ?? '', company: data.company ?? '', description: data.description ?? '', isActive: data.isActive ?? true, stops: [], busesAssigned: 0, createdAt: new Date().toISOString().split('T')[0] };
      setRoutes((prev) => [newRoute, ...prev]);
    } else if (modal && typeof modal === 'object') {
      setRoutes((prev) => prev.map((r) => r.id === modal.id ? { ...r, ...data } : r));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Rutas del Sistema</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            {routes.filter((r) => r.isActive).length} rutas activas · {routes.reduce((s, r) => s + r.stops.length, 0)} paraderos registrados
          </p>
        </div>
        <button
          id="new-route-btn"
          onClick={() => setModal('new')}
          style={{ padding: 'var(--space-3) var(--space-5)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', boxShadow: '0 4px 12px hsla(215,80%,46%,0.3)' }}
        >
          <span>➕</span> Nueva ruta
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            id="route-search-input"
            type="text"
            placeholder="Buscar por código o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-10)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <select id="route-company-filter" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
          style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {COMPANIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select id="route-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          <option value="ALL">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      {/* Routes table */}
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
          <thead style={{ background: 'var(--color-surface-2)' }}>
            <tr>
              {['', 'Código', 'Nombre de ruta', 'Empresa', 'Paraderos', 'Micros', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                  No se encontraron rutas
                </td>
              </tr>
            ) : (
              filtered.map((route) => (
                <>
                  <tr
                    key={route.id}
                    style={{ borderBottom: expandedId === route.id ? 'none' : '1px solid var(--color-border)', transition: 'background var(--transition-fast)', background: expandedId === route.id ? 'hsla(215,80%,46%,0.05)' : undefined }}
                    onMouseEnter={(e) => { if (expandedId !== route.id) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'; }}
                    onMouseLeave={(e) => { if (expandedId !== route.id) (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                  >
                    {/* Expand toggle */}
                    <td style={{ padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', width: '32px' }}>
                      <button
                        onClick={() => setExpandedId((id) => id === route.id ? null : route.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px', transition: 'transform var(--transition-fast)', transform: expandedId === route.id ? 'rotate(90deg)' : undefined }}
                      >
                        ▶
                      </button>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 800, fontSize: 'var(--font-size-base)', color: 'var(--color-primary-300)', fontFamily: 'monospace' }}>
                      {route.code}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{route.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{route.description}</p>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '12px' }}>{route.company}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {route.stops.length} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '11px' }}>paraderos</span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {route.busesAssigned} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '11px' }}>micros</span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <Badge label={route.isActive ? 'Activa' : 'Inactiva'} color={route.isActive ? 'hsl(142,71%,45%)' : 'hsl(220,10%,50%)'} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button onClick={() => setModal(route)} style={{ padding: '4px 10px', background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => toggleActive(route.id)} style={{ padding: '4px 10px', background: route.isActive ? 'hsla(0,84%,60%,0.1)' : 'hsla(142,71%,45%,0.1)', border: `1px solid ${route.isActive ? 'hsla(0,84%,60%,0.3)' : 'hsla(142,71%,45%,0.3)'}`, borderRadius: 'var(--radius-sm)', color: route.isActive ? 'hsl(0,84%,60%)' : 'hsl(142,71%,45%)', fontSize: '11px', cursor: 'pointer' }}>
                          {route.isActive ? '🚫' : '✅'}
                        </button>
                        <button onClick={() => setDeleteTarget(route)} style={{ padding: '4px 10px', background: 'hsla(0,84%,60%,0.08)', border: '1px solid hsla(0,84%,60%,0.2)', borderRadius: 'var(--radius-sm)', color: 'hsl(0,84%,60%)', fontSize: '11px', cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded stops */}
                  {expandedId === route.id && (
                    <tr key={`${route.id}-stops`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td colSpan={8} style={{ padding: '0 var(--space-4) var(--space-4) var(--space-12)', background: 'hsla(215,80%,46%,0.04)' }}>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                          Paraderos del recorrido
                        </p>
                        <div style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
                          {route.stops.map((stop, idx) => (
                            <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0', position: 'relative' }}>
                              {idx < route.stops.length - 1 && (
                                <div style={{ position: 'absolute', left: '10px', top: '24px', bottom: '-8px', width: '2px', background: 'var(--color-border)', zIndex: 0 }} />
                              )}
                              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: idx === 0 ? 'var(--color-primary-500)' : idx === route.stops.length - 1 ? 'hsl(142,71%,45%)' : 'var(--color-surface-3)', border: '2px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0, zIndex: 1 }}>
                                {stop.order}
                              </div>
                              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{stop.name}</p>
                              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                                {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Mostrando {filtered.length} de {routes.length} rutas</span>
        </div>
      </div>

      {/* Modals */}
      {modal !== null && <RouteModal onClose={() => setModal(null)} onSave={handleSave} initial={modal === 'new' ? undefined : modal} />}
      {deleteTarget !== null && <DeleteConfirm route={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget.id)} />}
    </div>
  );
}
