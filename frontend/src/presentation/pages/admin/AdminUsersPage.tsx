import { useState, useMemo, useEffect } from 'react';
import { apiClient } from '../../../infrastructure/api/apiClient';

// ── Tipos ─────────────────────────────────────────────────────
type UserRole = 'ADMIN' | 'COMPANY' | 'PASSENGER';
type UserStatus = 'active' | 'inactive';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Mock Data ─────────────────────────────────────────────────
const MOCK_USERS: AdminUser[] = [
  { id: 'u1', name: 'Rodrigo Vásquez', email: 'rodrigo.vasquez@transitadmin.cl', role: 'ADMIN', company: null, isActive: true, createdAt: '2025-01-15' },
  { id: 'u2', name: 'Claudia Torres', email: 'claudia.torres@busmetro.cl', role: 'COMPANY', company: 'Buses Metropolitanos', isActive: true, createdAt: '2025-02-03' },
  { id: 'u3', name: 'Miguel Herrera', email: 'miguel.herrera@transoriente.cl', role: 'COMPANY', company: 'Trans Oriente', isActive: true, createdAt: '2025-02-10' },
  { id: 'u4', name: 'Valentina Pérez', email: 'val.perez@gmail.com', role: 'PASSENGER', company: null, isActive: true, createdAt: '2025-03-20' },
  { id: 'u5', name: 'Felipe Rojas', email: 'felipe.rojas@gmail.com', role: 'PASSENGER', company: null, isActive: true, createdAt: '2025-04-11' },
  { id: 'u6', name: 'Daniela Fuentes', email: 'daniela.fuentes@gmail.com', role: 'PASSENGER', company: null, isActive: false, createdAt: '2025-04-25' },
  { id: 'u7', name: 'Andrés Castillo', email: 'andres.c@bussur.cl', role: 'COMPANY', company: 'Buses del Sur', isActive: true, createdAt: '2025-05-02' },
  { id: 'u8', name: 'Carolina López', email: 'carolina.lopez@gmail.com', role: 'PASSENGER', company: null, isActive: true, createdAt: '2025-06-14' },
  { id: 'u9', name: 'Tomás Navarro', email: 'tomas.navarro@transnorte.cl', role: 'COMPANY', company: 'Trans Norte', isActive: true, createdAt: '2025-07-01' },
  { id: 'u10', name: 'Isabela Morales', email: 'isabela.morales@gmail.com', role: 'PASSENGER', company: null, isActive: false, createdAt: '2025-07-18' },
  { id: 'u11', name: 'Sebastián Ríos', email: 'srios@transitadmin.cl', role: 'ADMIN', company: null, isActive: true, createdAt: '2025-08-05' },
  { id: 'u12', name: 'Natalia Vega', email: 'natalia.vega@gmail.com', role: 'PASSENGER', company: null, isActive: true, createdAt: '2025-08-12' },
];

// ── Helpers ───────────────────────────────────────────────────
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  COMPANY: 'Empresa',
  PASSENGER: 'Pasajero',
};

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'hsl(271,70%,60%)',
  COMPANY: 'hsl(215,80%,55%)',
  PASSENGER: 'hsl(199,89%,48%)',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: '9999px',
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

interface ModalProps {
  onClose: () => void;
  onSave: (data: Partial<AdminUser>) => Promise<void>;
  initial?: Partial<AdminUser>;
}

function UserModal({ onClose, onSave, initial }: ModalProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    role: initial?.role ?? 'PASSENGER' as UserRole,
    company: initial?.company ?? '',
    isActive: initial?.isActive ?? true,
  });

  const isEdit = !!initial?.id;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', width: '440px', maxWidth: '90vw',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>
          {isEdit ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {[
            { label: 'Nombre completo', key: 'name', type: 'text', placeholder: 'Juan Pérez' },
            { label: 'Correo electrónico', key: 'email', type: 'email', placeholder: 'juan@email.com' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>
                {label}
              </label>
              <input
                type={type}
                placeholder={placeholder}
                value={(form as Record<string, unknown>)[key] as string}
                readOnly={key === 'email'}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{
                  width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
                  outline: 'none', transition: 'border-color var(--transition-fast)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary-400)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>
              Rol
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
            >
              <option value="PASSENGER">Pasajero</option>
              <option value="COMPANY">Empresa</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {form.role === 'COMPANY' && (
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 'var(--space-1)' }}>
                Empresa
              </label>
              <input
                type="text"
                placeholder="Nombre de la empresa"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Usuario activo</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          {error && <p style={{ color: 'hsl(0,84%,60%)', fontSize: 'var(--font-size-sm)', margin: 0 }}>{error}</p>}
          <button
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1, padding: 'var(--space-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', cursor: saving ? 'wait' : 'pointer' }}
          >
            Cancelar
          </button>
          <button
            id="user-modal-save-btn"
            onClick={() => void submit()}
            disabled={saving}
            style={{ flex: 2, padding: 'var(--space-3)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'ALL'>('ALL');
  const [modal, setModal] = useState<AdminUser | null>(null);
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      try {
        const response = await apiClient.get<Array<{
          id: string;
          name: string;
          email: string;
          role: UserRole;
          companyId?: string | null;
          isActive: boolean;
          createdAt: string;
        }>>('/users/');

        if (active) {
          setUsers(response.data.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            company: user.companyId ?? null,
            isActive: user.isActive,
            createdAt: user.createdAt?.split('T')[0] ?? '',
          })));
        }
      } catch (error) {
        if (active) {
          setActionError(getApiError(error, 'No se pudieron cargar los usuarios.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadUsers();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchStatus = statusFilter === 'ALL' || (statusFilter === 'active' ? u.isActive : !u.isActive);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const getApiError = (error: unknown, fallback: string) => {
    const responseError = error as { response?: { data?: { error?: string } } };
    return responseError.response?.data?.error ?? fallback;
  };

  const toggleActive = async (user: AdminUser) => {
    try {
      const response = await apiClient.put<AdminUser>(`/users/${user.id}`, {
        name: user.name,
        role: user.role,
        isActive: !user.isActive,
      });
      setUsers((prev) => prev.map((current) => current.id === user.id
        ? { ...current, isActive: response.data.isActive }
        : current));
    } catch (error) {
      setActionError(getApiError(error, 'No se pudo cambiar el estado del usuario.'));
    }
  };

  const handleSave = async (data: Partial<AdminUser>) => {
    if (!modal) return;
    try {
      const response = await apiClient.put<AdminUser>(`/users/${modal.id}`, {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
      });
      setUsers((prev) => prev.map((user) => user.id === modal.id
        ? { ...user, name: response.data.name, role: response.data.role, isActive: response.data.isActive }
        : user));
    } catch (error) {
      throw new Error(getApiError(error, 'No se pudo actualizar el usuario.'));
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`¿Eliminar al usuario ${user.name}?`)) return;
    try {
      await apiClient.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((current) => current.id !== user.id));
    } catch (error) {
      setActionError(getApiError(error, 'No se pudo eliminar el usuario.'));
    }
  };

  const counts = {
    ADMIN: users.filter((u) => u.role === 'ADMIN').length,
    COMPANY: users.filter((u) => u.role === 'COMPANY').length,
    PASSENGER: users.filter((u) => u.role === 'PASSENGER').length,
    inactive: users.filter((u) => !u.isActive).length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Gestión de Usuarios
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            {users.length} usuarios registrados en el sistema
          </p>
        </div>
        <button
          id="new-user-btn"
          type="button"
          disabled
          title="La creación de usuarios requiere un endpoint de alta administrativa."
          style={{
            padding: 'var(--space-3) var(--space-5)', background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
            border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontWeight: 700,
            fontSize: 'var(--font-size-sm)', cursor: 'not-allowed', opacity: 0.55, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            boxShadow: '0 4px 12px hsla(215,80%,46%,0.3)',
          }}
        >
          <span>➕</span> Nuevo usuario (no disponible)
        </button>
      </div>
      {actionError && <p style={{ color: 'hsl(0,84%,60%)', background: 'hsla(0,84%,60%,0.1)', border: '1px solid hsla(0,84%,60%,0.25)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', margin: 0 }}>{actionError}</p>}

      {/* Stats chips */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {[
          { label: `${counts.ADMIN} Admins`, color: ROLE_COLORS.ADMIN },
          { label: `${counts.COMPANY} Empresas`, color: ROLE_COLORS.COMPANY },
          { label: `${counts.PASSENGER} Pasajeros`, color: ROLE_COLORS.PASSENGER },
          { label: `${counts.inactive} Inactivos`, color: 'hsl(0,84%,60%)' },
        ].map((c) => <Badge key={c.label} label={c.label} color={c.color} />)}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            id="user-search-input"
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-10)',
              background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
            }}
          />
        </div>
        {[
          { id: 'role-filter', value: roleFilter, onChange: (v: string) => setRoleFilter(v as UserRole | 'ALL'), options: [['ALL', 'Todos los roles'], ['ADMIN', 'Admin'], ['COMPANY', 'Empresa'], ['PASSENGER', 'Pasajero']] },
          { id: 'status-filter', value: statusFilter, onChange: (v: string) => setStatusFilter(v as UserStatus | 'ALL'), options: [['ALL', 'Todos los estados'], ['active', 'Activo'], ['inactive', 'Inactivo']] },
        ].map(({ id, value, onChange, options }) => (
          <select
            key={id}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ padding: 'var(--space-3)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}
          >
            {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead style={{ background: 'var(--color-surface-2)' }}>
              <tr>
                {['Usuario', 'Rol', 'Empresa', 'Estado', 'Registro', 'Acciones'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>Cargando usuarios...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    style={{ borderBottom: '1px solid var(--color-border)', transition: 'background var(--transition-fast)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                          background: `${ROLE_COLORS[user.role]}22`,
                          border: `1px solid ${ROLE_COLORS[user.role]}44`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700, color: ROLE_COLORS[user.role],
                        }}>
                          {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{user.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <Badge label={ROLE_LABELS[user.role]} color={ROLE_COLORS[user.role]} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                      {user.company ?? '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <Badge
                        label={user.isActive ? 'Activo' : 'Inactivo'}
                        color={user.isActive ? 'hsl(142,71%,45%)' : 'hsl(220,10%,50%)'}
                      />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                      {user.createdAt}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          onClick={() => setModal(user)}
                          style={{ padding: 'var(--space-1) var(--space-3)', background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer' }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => void toggleActive(user)}
                          style={{
                            padding: 'var(--space-1) var(--space-3)',
                            background: user.isActive ? 'hsla(0,84%,60%,0.1)' : 'hsla(142,71%,45%,0.1)',
                            border: `1px solid ${user.isActive ? 'hsla(0,84%,60%,0.3)' : 'hsla(142,71%,45%,0.3)'}`,
                            borderRadius: 'var(--radius-sm)',
                            color: user.isActive ? 'hsl(0,84%,60%)' : 'hsl(142,71%,45%)',
                            fontSize: '12px', cursor: 'pointer',
                          }}
                        >
                          {user.isActive ? '🚫 Desactivar' : '✅ Activar'}
                        </button>
                        <button
                          onClick={() => void handleDelete(user)}
                          style={{ padding: 'var(--space-1) var(--space-3)', background: 'hsla(0,84%,60%,0.08)', border: '1px solid hsla(0,84%,60%,0.2)', borderRadius: 'var(--radius-sm)', color: 'hsl(0,84%,60%)', fontSize: '12px', cursor: 'pointer' }}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Mostrando {filtered.length} de {users.length} usuarios
          </span>
        </div>
      </div>

      {/* Modal */}
      {modal !== null && (
        <UserModal
          onClose={() => setModal(null)}
          onSave={handleSave}
          initial={modal}
        />
      )}
    </div>
  );
}
