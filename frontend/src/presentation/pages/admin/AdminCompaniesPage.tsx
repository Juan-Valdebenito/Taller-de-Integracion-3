import { useState, useMemo } from 'react';

// ── Tipos ─────────────────────────────────────────────────────
interface Company {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
  buses: number;
  routes: number;
  pendingComplaints: number;
  createdAt: string;
}

// ── Mock Data ─────────────────────────────────────────────────
const MOCK_COMPANIES: Company[] = [
  { id: 'c1', name: 'Buses Metropolitanos S.A.', rut: '76.123.456-7', email: 'contacto@busmetro.cl', phone: '+56 2 2345 6789', address: 'Av. Alameda 1234, Santiago', isActive: true, buses: 87, routes: 18, pendingComplaints: 12, createdAt: '2024-03-10' },
  { id: 'c2', name: 'Trans Oriente Ltda.', rut: '77.234.567-8', email: 'admin@transoriente.cl', phone: '+56 2 2456 7890', address: 'Av. Grecia 567, Ñuñoa', isActive: true, buses: 54, routes: 11, pendingComplaints: 7, createdAt: '2024-04-22' },
  { id: 'c3', name: 'Buses del Sur SpA', rut: '78.345.678-9', email: 'info@bussur.cl', phone: '+56 2 2567 8901', address: 'Av. Pedro Aguirre Cerda 890, San Bernardo', isActive: true, buses: 42, routes: 9, pendingComplaints: 5, createdAt: '2024-05-15' },
  { id: 'c4', name: 'Trans Norte S.A.', rut: '79.456.789-0', email: 'contacto@transnorte.cl', phone: '+56 2 2678 9012', address: 'Av. Recoleta 321, Recoleta', isActive: true, buses: 30, routes: 10, pendingComplaints: 3, createdAt: '2024-06-01' },
  { id: 'c5', name: 'Líneas Poniente Ltda.', rut: '80.567.890-1', email: 'info@lineasponiente.cl', phone: '+56 2 2789 0123', address: 'Av. Pajaritos 456, Maipú', isActive: false, buses: 18, routes: 4, pendingComplaints: 0, createdAt: '2024-07-20' },
  { id: 'c6', name: 'Express Cordillera SpA', rut: '81.678.901-2', email: 'contacto@expresscord.cl', phone: '+56 2 2890 1234', address: 'Av. Larraín 789, La Reina', isActive: true, buses: 22, routes: 6, pendingComplaints: 2, createdAt: '2024-08-05' },
];

// ── Helpers ───────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: '9999px', fontSize: '11px', fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────
interface ModalProps {
  onClose: () => void;
  onSave: (data: Partial<Company>) => void;
  initial?: Partial<Company>;
}

function CompanyModal({ onClose, onSave, initial }: ModalProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    rut: initial?.rut ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    isActive: initial?.isActive ?? true,
  });
  const isEdit = !!initial?.id;

  const fields = [
    { key: 'name', label: 'Nombre de la empresa', placeholder: 'Buses XYZ S.A.' },
    { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
    { key: 'email', label: 'Correo electrónico', placeholder: 'contacto@empresa.cl' },
    { key: 'phone', label: 'Teléfono', placeholder: '+56 2 2345 6789' },
    { key: 'address', label: 'Dirección', placeholder: 'Av. Ejemplo 123, Ciudad' },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '480px', maxWidth: '90vw', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>
          {isEdit ? '✏️ Editar Empresa' : '➕ Nueva Empresa'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {fields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>
                {label}
              </label>
              <input
                type="text"
                placeholder={placeholder}
                value={(form as Record<string, unknown>)[key] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary-400)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Empresa activa</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            id="company-modal-save-btn"
            onClick={() => { onSave(form); onClose(); }}
            style={{ flex: 2, padding: 'var(--space-3)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' }}
          >
            {isEdit ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  const [modal, setModal] = useState<'new' | Company | null>(null);

  const filtered = useMemo(() => companies.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.rut.includes(search) || c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || (statusFilter === 'active' ? c.isActive : !c.isActive);
    return matchSearch && matchStatus;
  }), [companies, search, statusFilter]);

  const toggleActive = (id: string) => setCompanies((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !c.isActive } : c));

  const handleSave = (data: Partial<Company>) => {
    if (modal === 'new') {
      const newCompany: Company = { id: `c${Date.now()}`, name: data.name ?? '', rut: data.rut ?? '', email: data.email ?? '', phone: data.phone ?? '', address: data.address ?? '', isActive: data.isActive ?? true, buses: 0, routes: 0, pendingComplaints: 0, createdAt: new Date().toISOString().split('T')[0] };
      setCompanies((prev) => [newCompany, ...prev]);
    } else if (modal && typeof modal === 'object') {
      setCompanies((prev) => prev.map((c) => c.id === modal.id ? { ...c, ...data } : c));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>Empresas de Transporte</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            {companies.filter((c) => c.isActive).length} activas de {companies.length} registradas
          </p>
        </div>
        <button
          id="new-company-btn"
          onClick={() => setModal('new')}
          style={{ padding: 'var(--space-3) var(--space-5)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', boxShadow: '0 4px 12px hsla(215,80%,46%,0.3)' }}
        >
          <span>➕</span> Nueva empresa
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            id="company-search-input"
            type="text"
            placeholder="Buscar por nombre, RUT o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-10)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <select
          id="company-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}
        >
          <option value="ALL">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      {/* Company cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-5)' }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
            No se encontraron empresas
          </div>
        ) : (
          filtered.map((company) => (
            <div
              key={company.id}
              style={{
                background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
                transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
                opacity: company.isActive ? 1 : 0.6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-lg)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    🏢
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>{company.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{company.rut}</p>
                  </div>
                </div>
                <Badge label={company.isActive ? 'Activa' : 'Inactiva'} color={company.isActive ? 'hsl(142,71%,45%)' : 'hsl(220,10%,50%)'} />
              </div>

              {/* Contact info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {[{ icon: '📧', val: company.email }, { icon: '📞', val: company.phone }, { icon: '📍', val: company.address }].map(({ icon, val }) => (
                  <p key={val} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <span>{icon}</span><span>{val}</span>
                  </p>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' }}>
                {[
                  { label: 'Micros', value: company.buses, color: 'hsl(215,80%,55%)' },
                  { label: 'Rutas', value: company.routes, color: 'hsl(142,71%,45%)' },
                  { label: 'Reclamos', value: company.pendingComplaints, color: company.pendingComplaints > 0 ? 'hsl(0,84%,60%)' : 'var(--color-text-muted)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color }}>{value}</p>
                    <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  onClick={() => setModal(company)}
                  style={{ flex: 1, padding: 'var(--space-2)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer' }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => toggleActive(company.id)}
                  style={{
                    flex: 1, padding: 'var(--space-2)',
                    background: company.isActive ? 'hsla(0,84%,60%,0.1)' : 'hsla(142,71%,45%,0.1)',
                    border: `1px solid ${company.isActive ? 'hsla(0,84%,60%,0.3)' : 'hsla(142,71%,45%,0.3)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: company.isActive ? 'hsl(0,84%,60%)' : 'hsl(142,71%,45%)',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {company.isActive ? '🚫 Desactivar' : '✅ Activar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {modal !== null && (
        <CompanyModal
          onClose={() => setModal(null)}
          onSave={handleSave}
          initial={modal === 'new' ? undefined : modal}
        />
      )}
    </div>
  );
}
