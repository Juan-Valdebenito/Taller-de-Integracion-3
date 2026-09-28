import { useEffect, useMemo, useState } from 'react';
import { routesApi, type ApiRoute, type Company, type RouteBus, type RouteStop } from '../../../infrastructure/api/routesApi';

// ── Tipos ─────────────────────────────────────────────────────
interface Route extends ApiRoute {
  stops: RouteStop[];
  busesAssigned: number;
}

type RouteModalData = {
  code: string;
  name: string;
  companyId: string;
  description: string;
  isActive: boolean;
};

interface RouteModalProps {
  companies: Company[];
  onClose: () => void;
  onSave: (data: RouteModalData) => Promise<void>;
  initial?: Route;
  saving: boolean;
}

// ── Helpers ───────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

function RouteModal({ companies, onClose, onSave, initial, saving }: RouteModalProps) {
  const [form, setForm] = useState<RouteModalData>({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    companyId: initial?.companyId ?? companies[0]?.id ?? '',
    description: initial?.description ?? '',
    isActive: initial?.isActive ?? true,
  });

  const isEdit = !!initial?.id;

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.companyId) return;
    await onSave({
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '480px', maxWidth: '90vw', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>
          {isEdit ? '✏️ Editar Ruta' : '➕ Nueva Ruta'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Código</label>
              <input
                type="text"
                placeholder="101"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Nombre</label>
              <input
                type="text"
                placeholder="Centro – Las Condes"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Empresa</label>
            <select
              value={form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
              disabled={isEdit || saving}
              style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
            >
              {companies.length === 0 ? (
                <option value="">No hay empresas disponibles</option>
              ) : (
                companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))
              )}
            </select>
            {isEdit && <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>La empresa no se modifica desde el endpoint actual del backend.</p>}
          </div>

          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Descripción del recorrido..."
              style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} disabled={saving} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Ruta activa</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: saving ? 'not-allowed' : 'pointer' }}>Cancelar</button>
          <button
            id="route-modal-save-btn"
            onClick={() => void submit()}
            disabled={saving || !form.code.trim() || !form.name.trim() || !form.companyId}
            style={{ flex: 2, padding: 'var(--space-3)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear ruta'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ route, onClose, onConfirm, deleting }: { route: Route; onClose: () => void; onConfirm: () => Promise<void>; deleting: boolean }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onClose(); }}
    >
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid hsla(0,84%,60%,0.3)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '380px', maxWidth: '90vw', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, marginBottom: 'var(--space-3)', color: 'hsl(0,84%,60%)' }}>⚠️ Eliminar Ruta</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
          ¿Estás seguro de que deseas eliminar la ruta <strong style={{ color: 'var(--color-text-primary)' }}>{route.code} – {route.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button onClick={onClose} disabled={deleting} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>Cancelar</button>
          <button
            id="route-delete-confirm-btn"
            onClick={() => void onConfirm()}
            disabled={deleting}
            style={{ flex: 1, padding: 'var(--space-3)', background: 'hsl(0,84%,60%)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [routeDetails, setRouteDetails] = useState<Record<string, { stops: RouteStop[]; buses: RouteBus[]; loading: boolean; error?: string }>>({});
  const [modal, setModal] = useState<'new' | Route | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);

  const loadRoutes = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await routesApi.getAll();
      setRoutes(data.map((route) => ({ ...route, stops: [], busesAssigned: 0 })));
    } catch (err) {
      console.error('Error cargando rutas:', err);
      setError('No se pudieron cargar las rutas desde el backend.');
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      setCompanyError(null);
      const data = await routesApi.getCompanies();
      setCompanies(data);
    } catch (err) {
      console.error('Error cargando empresas:', err);
      setCompanyError('El backend todavía no expone GET /api/v1/companies.');
    }
  };

  useEffect(() => {
    void loadRoutes();
    void loadCompanies();
  }, []);

  const loadRouteDetails = async (routeId: string) => {
    setRouteDetails((prev) => ({ ...prev, [routeId]: { ...(prev[routeId] ?? { stops: [], buses: [] }), loading: true } }));

    try {
      const [stops, buses] = await Promise.all([
        routesApi.getStops(routeId),
        routesApi.getBuses(routeId),
      ]);

      setRouteDetails((prev) => ({
        ...prev,
        [routeId]: { stops, buses, loading: false },
      }));

      setRoutes((prev) => prev.map((route) => route.id === routeId ? { ...route, stops, busesAssigned: buses.length } : route));
    } catch (err) {
      console.error(`Error cargando detalles de ruta ${routeId}:`, err);
      setRouteDetails((prev) => ({
        ...prev,
        [routeId]: { ...(prev[routeId] ?? { stops: [], buses: [] }), loading: false, error: 'No se pudieron cargar los paraderos y buses.' },
      }));
    }
  };

  const toggleExpanded = (routeId: string) => {
    const next = expandedId === routeId ? null : routeId;
    setExpandedId(next);
    if (next && !routeDetails[next]) void loadRouteDetails(next);
  };

  const filtered = useMemo(() => routes.filter((route) => {
    const query = search.toLowerCase();
    const matchSearch = route.name.toLowerCase().includes(query) || route.code.toLowerCase().includes(query);
    const matchCompany = companyFilter === 'ALL' || route.companyId === companyFilter;
    const matchStatus = statusFilter === 'ALL' || (statusFilter === 'active' ? route.isActive : !route.isActive);
    return matchSearch && matchCompany && matchStatus;
  }), [routes, search, companyFilter, statusFilter, companyMap]);

  const handleSave = async (data: RouteModalData) => {
    try {
      setSaving(true);
      setError(null);

      if (modal === 'new') {
        await routesApi.create({
          name: data.name,
          code: data.code,
          description: data.description || undefined,
          companyId: data.companyId,
        });
      } else if (modal) {
        await routesApi.update(modal.id, {
          name: data.name,
          code: data.code,
          description: data.description || undefined,
          isActive: data.isActive,
        });
      }

      setModal(null);
      await loadRoutes();
    } catch (err: any) {
      console.error('Error guardando ruta:', err);
      setError(err?.response?.data?.error ?? 'No se pudo guardar la ruta.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (route: Route) => {
    try {
      setError(null);
      await routesApi.update(route.id, {
        name: route.name,
        code: route.code,
        description: route.description || undefined,
        isActive: !route.isActive,
      });
      await loadRoutes();
    } catch (err: any) {
      console.error('Error cambiando estado de ruta:', err);
      setError(err?.response?.data?.error ?? 'No se pudo cambiar el estado de la ruta.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      setError(null);
      await routesApi.delete(id);
      setDeleteTarget(null);
      if (expandedId === id) setExpandedId(null);
      await loadRoutes();
    } catch (err: any) {
      console.error('Error eliminando ruta:', err);
      setError(err?.response?.data?.error ?? 'No se pudo eliminar la ruta.');
    } finally {
      setDeleting(false);
    }
  };

  const activeRoutes = routes.filter((route) => route.isActive).length;
  const loadedStops = routes.reduce((sum, route) => sum + route.stops.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Rutas del Sistema</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            {activeRoutes} rutas activas · {loadedStops > 0 ? `${loadedStops} paraderos cargados` : 'paraderos bajo demanda'}
          </p>
        </div>
        <button
          id="new-route-btn"
          onClick={() => setModal('new')}
          disabled={companies.length === 0}
          title={companies.length === 0 ? 'Necesitas el endpoint GET /api/v1/companies' : 'Crear nueva ruta'}
          style={{ padding: 'var(--space-3) var(--space-5)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: companies.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', boxShadow: '0 4px 12px hsla(215,80%,46%,0.3)', opacity: companies.length === 0 ? 0.5 : 1 }}
        >
          <span>➕</span> Nueva ruta
        </button>
      </div>

      {error && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'hsla(0,84%,60%,0.1)', border: '1px solid hsla(0,84%,60%,0.3)', borderRadius: 'var(--radius-md)', color: 'hsl(0,84%,70%)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      {companyError && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'hsla(38,92%,50%,0.1)', border: '1px solid hsla(38,92%,50%,0.3)', borderRadius: 'var(--radius-md)', color: 'hsl(38,92%,65%)', fontSize: 'var(--font-size-sm)' }}>
          {companyError} Para crear rutas desde el formulario, primero agrega ese endpoint al backend.
        </div>
      )}

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

        <select id="route-company-filter" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          <option value="ALL">Todas las empresas</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>

        <select id="route-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          <option value="ALL">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
          <thead style={{ background: 'var(--color-surface-2)' }}>
            <tr>
              {['', 'Código', 'Nombre de ruta', 'Empresa', 'Paraderos', 'Micros', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>Cargando rutas...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>No se encontraron rutas</td></tr>
            ) : (
              filtered.map((route) => {
                const companyName = companyMap.get(route.companyId) ?? route.companyId;
                const detail = routeDetails[route.id];

                return (
                  <>
                  <tr key={route.id} style={{ borderBottom: expandedId === route.id ? 'none' : '1px solid var(--color-border)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', width: '32px' }}>
                      <button onClick={() => toggleExpanded(route.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px', transition: 'transform var(--transition-fast)', transform: expandedId === route.id ? 'rotate(90deg)' : undefined }}>▶</button>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 800, fontSize: 'var(--font-size-base)', color: 'var(--color-primary-300)', fontFamily: 'monospace' }}>{route.code}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{route.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{route.description ?? 'Sin descripción'}</p>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '12px' }}>{companyName}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {detail?.loading ? '...' : route.stops.length} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '11px' }}>paraderos</span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {detail?.loading ? '...' : route.busesAssigned} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '11px' }}>micros</span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}><Badge label={route.isActive ? 'Activa' : 'Inactiva'} color={route.isActive ? 'hsl(142,71%,45%)' : 'hsl(220,10%,50%)'} /></td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button onClick={() => setModal(route)} style={{ padding: '4px 10px', background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => void toggleActive(route)} style={{ padding: '4px 10px', background: route.isActive ? 'hsla(0,84%,60%,0.1)' : 'hsla(142,71%,45%,0.1)', border: `1px solid ${route.isActive ? 'hsla(0,84%,60%,0.3)' : 'hsla(142,71%,45%,0.3)'}`, borderRadius: 'var(--radius-sm)', color: route.isActive ? 'hsl(0,84%,60%)' : 'hsl(142,71%,45%)', fontSize: '11px', cursor: 'pointer' }}>{route.isActive ? '🚫' : '✅'}</button>
                        <button onClick={() => setDeleteTarget(route)} style={{ padding: '4px 10px', background: 'hsla(0,84%,60%,0.08)', border: '1px solid hsla(0,84%,60%,0.2)', borderRadius: 'var(--radius-sm)', color: 'hsl(0,84%,60%)', fontSize: '11px', cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>

                  {expandedId === route.id && (
                    <tr key={`${route.id}-details`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td colSpan={8} style={{ padding: '0 var(--space-4) var(--space-4) var(--space-12)', background: 'hsla(215,80%,46%,0.04)' }}>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)', marginTop: 'var(--space-3)' }}>Paraderos del recorrido</p>
                        {detail?.loading ? (
                          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Cargando paraderos y buses...</p>
                        ) : detail?.error ? (
                          <p style={{ color: 'hsl(0,84%,65%)', fontSize: 'var(--font-size-sm)' }}>{detail.error}</p>
                        ) : route.stops.length === 0 ? (
                          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Esta ruta no tiene paraderos registrados.</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
                            {route.stops.map((stop, idx) => (
                              <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0', position: 'relative' }}>
                                {idx < route.stops.length - 1 && <div style={{ position: 'absolute', left: '10px', top: '24px', bottom: '-8px', width: '2px', background: 'var(--color-border)', zIndex: 0 }} />}
                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: idx === 0 ? 'var(--color-primary-500)' : idx === route.stops.length - 1 ? 'hsl(142,71%,45%)' : 'var(--color-surface-3)', border: '2px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0, zIndex: 1 }}>{stop.order}</div>
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{stop.name}</p>
                                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </>
                );
              })
            )}
          </tbody>
        </table>

        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Mostrando {filtered.length} de {routes.length} rutas</span>
        </div>
      </div>

      {modal !== null && <RouteModal companies={companies} onClose={() => setModal(null)} onSave={handleSave} initial={modal === 'new' ? undefined : modal} saving={saving} />}
      {deleteTarget !== null && <DeleteConfirm route={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget.id)} deleting={deleting} />}
    </div>
  );
}
