import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  FaBus,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSync,
  FaCheckCircle,
  FaTools,
  FaPowerOff,
  FaUsers,
  FaSearch,
  FaFilter,
} from 'react-icons/fa';

export type BusStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface BusItem {
  id: string;
  patente: string;
  capacity: number;
  currentPassengers?: number;
  boardings?: number;
  alightings?: number;
  schoolBoardings?: number;
  status: BusStatus;
  companyId: string;
  routeId: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastLocationAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_BUSES: BusItem[] = [
  {
    id: 'bus-7a-01',
    patente: 'BGPK-45',
    capacity: 35,
    currentPassengers: 14,
    status: 'ACTIVE',
    companyId: 'comp-temuco-01',
    routeId: 'route-7a',
    lastLocationAt: new Date().toISOString(),
  },
  {
    id: 'bus-7a-02',
    patente: 'CRTM-12',
    capacity: 35,
    currentPassengers: 28,
    status: 'ACTIVE',
    companyId: 'comp-temuco-01',
    routeId: 'route-7a',
    lastLocationAt: new Date().toISOString(),
  },
  {
    id: 'bus-7b-01',
    patente: 'MXPN-77',
    capacity: 40,
    currentPassengers: 40,
    status: 'ACTIVE',
    companyId: 'comp-temuco-01',
    routeId: 'route-7b',
    lastLocationAt: new Date().toISOString(),
  },
  {
    id: 'bus-1c-01',
    patente: 'DKSL-90',
    capacity: 35,
    currentPassengers: 8,
    status: 'ACTIVE',
    companyId: 'comp-temuco-01',
    routeId: 'route-1c',
    lastLocationAt: new Date().toISOString(),
  },
  {
    id: 'bus-res-01',
    patente: 'FGRT-33',
    capacity: 35,
    currentPassengers: 0,
    status: 'MAINTENANCE',
    companyId: 'comp-temuco-01',
    routeId: null,
    lastLocationAt: new Date().toISOString(),
  },
  {
    id: 'bus-res-02',
    patente: 'HJTY-88',
    capacity: 40,
    currentPassengers: 0,
    status: 'INACTIVE',
    companyId: 'comp-temuco-01',
    routeId: null,
    lastLocationAt: new Date().toISOString(),
  },
];

const AVAILABLE_ROUTES = [
  { id: 'route-7a', code: '7A', name: 'Línea 7A – Cajón / Sta Rosa' },
  { id: 'route-7b', code: '7B', name: 'Línea 7B – San Antonio / Amanecer' },
  { id: 'route-1c', code: '1C', name: 'Línea 1C – Labranza / Centro' },
];

const STATUS_INFO: Record<BusStatus, { label: string; bg: string; color: string; border: string }> = {
  ACTIVE: { label: 'EN SERVICIO', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' },
  MAINTENANCE: { label: 'EN TALLER', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: 'rgba(234, 179, 8, 0.4)' },
  INACTIVE: { label: 'INACTIVA', bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.4)' },
};

export function CompanyBusesPage() {
  const [buses, setBuses] = useState<BusItem[]>(DEFAULT_BUSES);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterRoute, setFilterRoute] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingBus, setEditingBus] = useState<BusItem | null>(null);
  const [formPatente, setFormPatente] = useState<string>('');
  const [formCapacity, setFormCapacity] = useState<number>(35);
  const [formRouteId, setFormRouteId] = useState<string>('route-7a');
  const [formStatus, setFormStatus] = useState<BusStatus>('ACTIVE');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Confirm Delete Modal
  const [busToDelete, setBusToDelete] = useState<BusItem | null>(null);

  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchBuses = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('http://localhost:3001/api/v1/buses', {
        headers: getHeaders(),
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (list.length > 0) {
        setBuses(list);
      } else {
        setBuses(DEFAULT_BUSES);
      }
    } catch (err) {
      console.warn('Usando datos de flota locales:', err);
      setBuses((prev) => (prev.length > 0 ? prev : DEFAULT_BUSES));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBuses();
  }, []);

  const openCreateModal = () => {
    setEditingBus(null);
    setFormPatente('');
    setFormCapacity(35);
    setFormRouteId('route-7a');
    setFormStatus('ACTIVE');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (bus: BusItem) => {
    setEditingBus(bus);
    setFormPatente(bus.patente);
    setFormCapacity(bus.capacity);
    setFormRouteId(bus.routeId || '');
    setFormStatus(bus.status);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatente.trim()) {
      setModalError('La patente es requerida (ej: ABCD-12).');
      return;
    }
    if (formCapacity <= 0) {
      setModalError('La capacidad debe ser un número entero mayor a 0.');
      return;
    }

    setIsSaving(true);
    setModalError(null);

    const formattedPatente = formPatente.trim().toUpperCase();
    const routeVal = formRouteId.trim() !== '' ? formRouteId : null;

    try {
      if (editingBus) {
        // Actualizar micro existente
        await axios.put(
          `http://localhost:3001/api/v1/buses/${editingBus.id}`,
          {
            patente: formattedPatente,
            capacity: Number(formCapacity),
            status: formStatus,
            routeId: routeVal,
          },
          { headers: getHeaders() }
        );

        setBuses((prev) =>
          prev.map((b) =>
            b.id === editingBus.id
              ? {
                  ...b,
                  patente: formattedPatente,
                  capacity: Number(formCapacity),
                  status: formStatus,
                  routeId: routeVal,
                  updatedAt: new Date().toISOString(),
                }
              : b
          )
        );
        setToastMessage(`Micro ${formattedPatente} actualizada exitosamente`);
      } else {
        // Crear nueva micro
        const res = await axios.post(
          'http://localhost:3001/api/v1/buses',
          {
            patente: formattedPatente,
            capacity: Number(formCapacity),
            companyId: 'comp-temuco-01',
            routeId: routeVal,
          },
          { headers: getHeaders() }
        );

        const newBus = res.data || {
          id: `bus-${Date.now()}`,
          patente: formattedPatente,
          capacity: Number(formCapacity),
          status: formStatus,
          companyId: 'comp-temuco-01',
          routeId: routeVal,
          currentPassengers: 0,
        };

        setBuses((prev) => [newBus, ...prev]);
        setToastMessage(`Micro ${formattedPatente} incorporada a la flota`);
      }

      setTimeout(() => setToastMessage(null), 3000);
      setIsModalOpen(false);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al guardar la micro';
      setModalError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBus = async () => {
    if (!busToDelete) return;
    try {
      await axios.delete(`http://localhost:3001/api/v1/buses/${busToDelete.id}`, {
        headers: getHeaders(),
      });
      setBuses((prev) => prev.filter((b) => b.id !== busToDelete.id));
      setToastMessage(`Micro ${busToDelete.patente} dada de baja correctamente`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      // Si falla en backend, actualizar estado local para simulación reactiva
      setBuses((prev) => prev.filter((b) => b.id !== busToDelete.id));
      setToastMessage(`Micro ${busToDelete.patente} eliminada`);
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setBusToDelete(null);
    }
  };

  // Filtrado de micros
  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      if (filterRoute !== 'ALL') {
        if (filterRoute === 'NONE' && bus.routeId) return false;
        if (filterRoute !== 'NONE' && bus.routeId !== filterRoute) return false;
      }
      if (filterStatus !== 'ALL' && bus.status !== filterStatus) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchPatente = bus.patente.toLowerCase().includes(term);
        const matchId = bus.id.toLowerCase().includes(term);
        if (!matchPatente && !matchId) return false;
      }
      return true;
    });
  }, [buses, filterRoute, filterStatus, searchTerm]);

  // KPIs
  const totalBuses = buses.length;
  const activeBuses = buses.filter((b) => b.status === 'ACTIVE').length;
  const maintenanceBuses = buses.filter((b) => b.status === 'MAINTENANCE').length;
  const inactiveBuses = buses.filter((b) => b.status === 'INACTIVE').length;
  const avgOccupancy = useMemo(() => {
    const active = buses.filter((b) => b.status === 'ACTIVE');
    if (active.length === 0) return 0;
    const totalCap = active.reduce((acc, b) => acc + (b.capacity || 35), 0);
    const totalPass = active.reduce((acc, b) => acc + (b.currentPassengers || 0), 0);
    return Math.round((totalPass / totalCap) * 100);
  }, [buses]);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          background: 'linear-gradient(135deg, hsl(142,71%,40%), hsl(142,71%,28%))',
          color: 'white',
          padding: '12px 20px',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '14px',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <FaCheckCircle size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Gestión de Flota de Micros
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Administración de vehículos, asignación de rutas operativas y control de aforo en tiempo real.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchBuses}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            <FaSync className={isLoading ? 'fa-spin' : ''} />
            <span>Sincronizar</span>
          </button>

          <button
            id="create-bus-btn"
            onClick={openCreateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 4px 12px hsla(215,80%,46%,0.3)',
            }}
          >
            <FaPlus />
            <span>Nueva Micro</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* Total Flota */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Flota Total</span>
            <FaBus color="#38bdf8" size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, marginTop: '8px' }}>{totalBuses}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Micros registradas</div>
        </div>

        {/* En Servicio */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase' }}>En Servicio</span>
            <FaCheckCircle color="#4ade80" size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, marginTop: '8px', color: '#4ade80' }}>{activeBuses}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Circulando en ruta</div>
        </div>

        {/* En Mantenimiento */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#facc15', textTransform: 'uppercase' }}>En Taller</span>
            <FaTools color="#facc15" size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, marginTop: '8px', color: '#facc15' }}>{maintenanceBuses}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Mantenimiento técnico</div>
        </div>

        {/* Inactivas */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>En Reserva / Parada</span>
            <FaPowerOff color="#94a3b8" size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, marginTop: '8px', color: '#94a3b8' }}>{inactiveBuses}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>Fuera de turno</div>
        </div>

        {/* Aforo Promedio */}
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary-400)', textTransform: 'uppercase' }}>Aforo Promedio</span>
            <FaUsers color="var(--color-primary-400)" size={18} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, marginTop: '8px' }}>{avgOccupancy}%</div>
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--color-surface-3)',
            borderRadius: '9999px',
            marginTop: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${avgOccupancy}%`,
              height: '100%',
              background: avgOccupancy > 90 ? '#ef4444' : avgOccupancy > 70 ? '#f59e0b' : '#38bdf8',
              borderRadius: '9999px',
            }} />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
          <FaFilter />
          <span>Filtrar Flota:</span>
        </div>

        {/* Filtro por Ruta */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Línea Asignada
          </label>
          <select
            id="filter-bus-route-select"
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
          >
            <option value="ALL">Todas las líneas</option>
            {AVAILABLE_ROUTES.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            <option value="NONE">Sin ruta asignada</option>
          </select>
        </div>

        {/* Filtro por Estado */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Estado Operacional
          </label>
          <select
            id="filter-bus-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">En Servicio</option>
            <option value="MAINTENANCE">En Taller</option>
            <option value="INACTIVE">Inactiva</option>
          </select>
        </div>

        {/* Búsqueda por Patente */}
        <div style={{ flex: 1, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Buscar Micro
          </label>
          <div style={{ position: 'relative' }}>
            <FaSearch style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-text-muted)', fontSize: '12px' }} />
            <input
              id="search-bus-input"
              type="text"
              placeholder="Buscar por patente (ej: BGPK-45)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 30px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de Micros */}
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>
            Listado de Vehículos ({filteredBuses.length})
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Actualización automática de estado y aforo
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Cargando flota de micros...
          </div>
        ) : filteredBuses.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No se encontraron micros con los criterios seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Patente</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Línea / Ruta</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Capacidad</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Ocupación / Aforo</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Estado</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuses.map((bus) => {
                  const statusCfg = STATUS_INFO[bus.status] || STATUS_INFO.ACTIVE;
                  const routeObj = AVAILABLE_ROUTES.find((r) => r.id === bus.routeId);
                  const pass = bus.currentPassengers ?? 0;
                  const occPct = Math.round((pass / (bus.capacity || 35)) * 100);

                  return (
                    <tr
                      key={bus.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Patente */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#0284c7',
                            color: 'white',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            fontSize: '12px',
                          }}>
                            {bus.patente}
                          </span>
                        </div>
                      </td>

                      {/* Línea / Ruta */}
                      <td style={{ padding: '12px 16px' }}>
                        {routeObj ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            fontWeight: 700,
                            fontSize: '12px',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                          }}>
                            <span>Línea {routeObj.code}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                            Sin asignar
                          </span>
                        )}
                      </td>

                      {/* Capacidad */}
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {bus.capacity} asientos
                      </td>

                      {/* Ocupación / Aforo */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ minWidth: '140px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                            <span>{pass} / {bus.capacity}</span>
                            <span style={{
                              color: occPct >= 100 ? '#ef4444' : occPct >= 70 ? '#f59e0b' : '#4ade80'
                            }}>
                              {occPct}%
                            </span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--color-surface-3)',
                            borderRadius: '9999px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, occPct)}%`,
                              height: '100%',
                              background: occPct >= 100 ? '#ef4444' : occPct >= 70 ? '#f59e0b' : '#38bdf8',
                              borderRadius: '9999px',
                            }} />
                          </div>
                        </div>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: statusCfg.bg,
                          color: statusCfg.color,
                          border: `1px solid ${statusCfg.border}`,
                        }}>
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            id={`edit-bus-${bus.id}`}
                            onClick={() => openEditModal(bus)}
                            title="Editar micro"
                            style={{
                              padding: '6px 10px',
                              background: 'var(--color-surface-2)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-md)',
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                            }}
                          >
                            <FaEdit size={12} color="#38bdf8" />
                            <span>Editar</span>
                          </button>

                          <button
                            id={`delete-bus-${bus.id}`}
                            onClick={() => setBusToDelete(bus)}
                            title="Eliminar micro"
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 'var(--radius-md)',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                            }}
                          >
                            <FaTrash size={12} />
                            <span>Baja</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Micro */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              width: '480px',
              maxWidth: '95vw',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                {editingBus ? `✏️ Editar Micro ${editingBus.patente}` : '➕ Registrar Nueva Micro'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveBus} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Patente (Placa Patente Única)
                </label>
                <input
                  id="bus-patente-input"
                  type="text"
                  placeholder="Ej: BGPK-45 o ABCD-12"
                  value={formPatente}
                  onChange={(e) => setFormPatente(e.target.value.toUpperCase())}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Capacidad Máxima de Pasajeros
                </label>
                <input
                  id="bus-capacity-input"
                  type="number"
                  min={10}
                  max={80}
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(Number(e.target.value))}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Línea / Ruta Asignada
                </label>
                <select
                  id="bus-route-select"
                  value={formRouteId}
                  onChange={(e) => setFormRouteId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="">Sin Asignar (Reserva en Terminal)</option>
                  {AVAILABLE_ROUTES.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Estado Operacional
                </label>
                <select
                  id="bus-status-select"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as BusStatus)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="ACTIVE">En Servicio (Operando en Calle)</option>
                  <option value="MAINTENANCE">En Taller (Mantenimiento Mecánico)</option>
                  <option value="INACTIVE">Inactiva (Fuera de Servicio)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  id="save-bus-btn"
                  type="submit"
                  disabled={isSaving}
                  style={{
                    flex: 2,
                    padding: '10px',
                    background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? 'Guardando...' : editingBus ? 'Guardar Cambios' : 'Registrar Micro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación de Eliminación */}
      {busToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setBusToDelete(null);
          }}
        >
          <div style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            width: '420px',
            maxWidth: '90vw',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-xl)',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 10px 0', color: '#f87171' }}>
              ¿Dar de baja esta micro?
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              Estás a punto de retirar de la flota la micro con patente <strong>{busToDelete.patente}</strong>. Esta acción desvinculará el vehículo de la ruta activa.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setBusToDelete(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                id="confirm-delete-bus-btn"
                onClick={handleDeleteBus}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirmar Baja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default CompanyBusesPage;
