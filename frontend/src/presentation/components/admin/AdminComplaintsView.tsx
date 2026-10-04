import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  FaStar,
  FaCheckCircle,
  FaClock,
  FaFilter,
  FaSync,
  FaEdit,
  FaChartLine,
} from 'react-icons/fa';

export type ComplaintStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type ComplaintCategory =
  | 'OVERCROWDING'
  | 'DELAY'
  | 'DRIVER_BEHAVIOR'
  | 'FARES_PAYMENT'
  | 'VEHICLE_CONDITION'
  | 'ACCESSIBILITY'
  | 'OTHER';

export interface ComplaintItem {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  rating: number | null;
  status: ComplaintStatus;
  adminResponse: string | null;
  busId: string | null;
  lineName: string | null;
  passengerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintStatsData {
  totalComplaints: number;
  averageRating: number;
  csat: number;
  resolvedPercentage: number;
  pendingCount: number;
  inReviewCount: number;
  resolvedCount: number;
  rejectedCount: number;
  byCategory: Record<string, number>;
  byLine: Record<string, number>;
  byStatus: Record<string, number>;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  OVERCROWDING: { label: 'Sobrecupo / Aforo', icon: '⚠️' },
  DELAY: { label: 'Frecuencia / Retraso', icon: '⏱️' },
  DRIVER_BEHAVIOR: { label: 'Conducta Chofer', icon: '🛑' },
  FARES_PAYMENT: { label: 'Pago Tarifa / Bipay', icon: '💳' },
  VEHICLE_CONDITION: { label: 'Estado Vehículo', icon: '🧹' },
  ACCESSIBILITY: { label: 'Accesibilidad', icon: '♿' },
  OTHER: { label: 'Otro Incidente', icon: 'ℹ️' },
};

const STATUS_CONFIG: Record<ComplaintStatus, { label: string; bg: string; color: string; border: string }> = {
  PENDING: { label: 'PENDIENTE', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: 'rgba(234, 179, 8, 0.4)' },
  IN_REVIEW: { label: 'EN REVISIÓN', bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' },
  RESOLVED: { label: 'RESUELTO', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' },
  REJECTED: { label: 'RECHAZADO', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)' },
};

export const AdminComplaintsView: React.FC = () => {
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [stats, setStats] = useState<ComplaintStatsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(true);

  // Filtros
  const [filterLine, setFilterLine] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal de resolución
  const [managingComplaint, setManagingComplaint] = useState<ComplaintItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<ComplaintStatus>('IN_REVIEW');
  const [adminResponseText, setAdminResponseText] = useState<string>('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const getHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchStats = async () => {
    setIsStatsLoading(true);
    try {
      const res = await axios.get('http://localhost:3001/api/v1/complaints/stats', {
        headers: getHeaders(),
      });
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.warn('Fallback a cálculo local de estadísticas:', err);
    } finally {
      setIsStatsLoading(false);
    }
  };

  const fetchComplaints = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('http://localhost:3001/api/v1/complaints', {
        headers: getHeaders(),
      });
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setComplaints(list);
    } catch (err) {
      console.error('Error al cargar reclamos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAll = () => {
    fetchStats();
    fetchComplaints();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const handleOpenResolutionModal = (complaint: ComplaintItem) => {
    setManagingComplaint(complaint);
    setTargetStatus(complaint.status === 'PENDING' ? 'IN_REVIEW' : complaint.status);
    setAdminResponseText(complaint.adminResponse || '');
  };

  const handleCloseResolutionModal = () => {
    setManagingComplaint(null);
    setAdminResponseText('');
  };

  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingComplaint) return;

    setIsSubmittingResolution(true);
    try {
      await axios.patch(
        `http://localhost:3001/api/v1/complaints/${managingComplaint.id}/status`,
        {
          status: targetStatus,
          adminResponse: adminResponseText.trim() || 'Resolución registrada por la administración.',
        },
        { headers: getHeaders() }
      );

      setToastMessage(`Reclamo ${managingComplaint.id.slice(0, 8)} actualizado a ${targetStatus}`);
      setTimeout(() => setToastMessage(null), 3500);
      handleCloseResolutionModal();
      refreshAll();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al actualizar reclamo';
      alert(`Error: ${msg}`);
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Filtrado de reclamos
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (filterLine !== 'ALL') {
        const line = (c.lineName || '').toUpperCase();
        if (!line.includes(filterLine.toUpperCase())) return false;
      }
      if (filterStatus !== 'ALL' && c.status !== filterStatus) {
        return false;
      }
      if (filterCategory !== 'ALL' && c.category !== filterCategory) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchesId = c.id.toLowerCase().includes(term);
        const matchesTitle = (c.title || '').toLowerCase().includes(term);
        const matchesDesc = (c.description || '').toLowerCase().includes(term);
        const matchesBus = (c.busId || '').toLowerCase().includes(term);
        if (!matchesId && !matchesTitle && !matchesDesc && !matchesBus) return false;
      }
      return true;
    });
  }, [complaints, filterLine, filterStatus, filterCategory, searchTerm]);

  // Métricas calculadas como fallback si el backend stats aún no cargó
  const totalCount = stats?.totalComplaints ?? complaints.length;
  const avgRating = stats?.averageRating ?? (
    complaints.length > 0 
      ? Number((complaints.reduce((acc, c) => acc + (c.rating || 0), 0) / complaints.filter(c => c.rating).length || 0).toFixed(1))
      : 0
  );
  const resolutionRate = stats?.resolvedPercentage ?? (
    complaints.length > 0
      ? Number(((complaints.filter(c => c.status === 'RESOLVED').length / complaints.length) * 100).toFixed(1))
      : 0
  );
  const pendingCount = stats?.pendingCount ?? complaints.filter(c => c.status === 'PENDING').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }}>
      {/* Toast Feedback */}
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

      {/* Header con botón de sincronización */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Panel de Reclamos y Calidad de Servicio
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Supervisión analítica y resolución de incidentes para las líneas 7A, 7B y 1C de Temuco.
          </p>
        </div>
        <button
          id="refresh-complaints-btn"
          onClick={refreshAll}
          disabled={isLoading || isStatsLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'background var(--transition-fast)',
          }}
        >
          <FaSync className={isLoading ? 'fa-spin' : ''} />
          <span>Actualizar Datos</span>
        </button>
      </div>

      {/* Tarjetas KPI Superiores */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* Total Reclamos */}
        <div style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Reclamos
            </span>
            <span style={{ fontSize: '20px' }}>📋</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '10px 0 4px 0' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Líneas 7A, 7B y 1C registradas
          </div>
        </div>

        {/* Calificación Promedio Flota (CSAT) */}
        <div style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CSAT Promedio Flota
            </span>
            <FaStar color="#f59e0b" size={18} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '10px 0 4px 0' }}>
            <span style={{ fontSize: '32px', fontWeight: 800, color: '#f59e0b' }}>
              {avgRating.toFixed(1)}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>/ 5.0</span>
          </div>
          <div style={{ display: 'flex', color: '#f59e0b', gap: '4px', fontSize: '13px' }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <FaStar key={s} color={s <= Math.round(avgRating) ? '#f59e0b' : 'rgba(245, 158, 11, 0.2)'} />
            ))}
          </div>
        </div>

        {/* Tasa de Resolución (%) */}
        <div style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tasa de Resolución
            </span>
            <FaChartLine color="#4ade80" size={18} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#4ade80', margin: '10px 0 4px 0' }}>
            {resolutionRate.toFixed(1)}%
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--color-surface-3)',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, resolutionRate)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #16a34a, #4ade80)',
              borderRadius: '9999px',
            }} />
          </div>
        </div>

        {/* Casos Pendientes */}
        <div style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Reclamos Pendientes
            </span>
            <FaClock color="#facc15" size={18} />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#facc15', margin: '10px 0 4px 0' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            Requieren revisión administrativa
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
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
          <span>Filtros:</span>
        </div>

        {/* Filtro por Línea (Todas, 7A, 7B, 1C) */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Línea
          </label>
          <select
            id="filter-line-select"
            value={filterLine}
            onChange={(e) => setFilterLine(e.target.value)}
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
            <option value="7A">Línea 7A</option>
            <option value="7B">Línea 7B</option>
            <option value="1C">Línea 1C</option>
          </select>
        </div>

        {/* Filtro por Estado */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Estado
          </label>
          <select
            id="filter-status-select"
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
            <option value="PENDING">Pendientes</option>
            <option value="IN_REVIEW">En Revisión</option>
            <option value="RESOLVED">Resueltos</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </div>

        {/* Filtro por Categoría */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Categoría
          </label>
          <select
            id="filter-category-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
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
            <option value="ALL">Todas las categorías</option>
            <option value="OVERCROWDING">⚠️ Sobrecupo / Aforo</option>
            <option value="DELAY">⏱️ Retraso / Demora</option>
            <option value="DRIVER_BEHAVIOR">🛑 Conducción Imprudente</option>
            <option value="FARES_PAYMENT">💳 Pago de Tarifa / Bipay</option>
            <option value="VEHICLE_CONDITION">🧹 Estado del Vehículo</option>
            <option value="ACCESSIBILITY">♿ Accesibilidad</option>
            <option value="OTHER">ℹ️ Otro</option>
          </select>
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Búsqueda
          </label>
          <input
            id="search-complaint-input"
            type="text"
            placeholder="Buscar por ID, micro o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 12px',
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

      {/* Tabla de Reclamos Accionables */}
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>
            Listado de Reclamos ({filteredComplaints.length})
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Filas accionables mediante botón Gestionar
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Cargando reclamos del sistema...
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No se encontraron reclamos con los filtros seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Fecha</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Línea</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Calificación</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Categoría</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Estado</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((item) => {
                  const badge = STATUS_CONFIG[item.status] || {
                    label: item.status,
                    bg: '#334155',
                    color: '#cbd5e1',
                    border: '#475569',
                  };
                  const catInfo = CATEGORY_CONFIG[item.category] || { label: item.category, icon: '📌' };
                  const shortId = item.id.length > 10 ? `${item.id.slice(0, 8)}...` : item.id;
                  const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : 'N/A';

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* ID */}
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                        {shortId}
                      </td>

                      {/* Fecha */}
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        {dateStr}
                      </td>

                      {/* Línea */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: '11px',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                        }}>
                          {item.lineName ? `Línea ${item.lineName}` : (item.busId ? item.busId : '7A')}
                        </span>
                      </td>

                      {/* Calificación */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', color: '#f59e0b', gap: '2px' }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <FaStar
                              key={s}
                              size={12}
                              color={s <= (item.rating || 0) ? '#f59e0b' : 'rgba(255,255,255,0.15)'}
                            />
                          ))}
                        </div>
                      </td>

                      {/* Categoría */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{catInfo.icon}</span>
                          <span>{catInfo.label}</span>
                        </span>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Acción Gestionar */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          id={`manage-complaint-${item.id}`}
                          onClick={() => handleOpenResolutionModal(item)}
                          style={{
                            padding: '6px 14px',
                            background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                          }}
                        >
                          <FaEdit size={12} />
                          <span>Gestionar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Resolución Administrativa */}
      {managingComplaint && (
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
            if (e.target === e.currentTarget) handleCloseResolutionModal();
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              width: '560px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-xl)',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-5)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Resolución Oficial de Reclamo
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '4px 0 0 0' }}>
                  {managingComplaint.title || 'Detalle del Incidente'}
                </h3>
              </div>
              <button
                onClick={handleCloseResolutionModal}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Contexto del Incidente */}
            <div style={{ background: 'var(--color-surface-2)', padding: '14px', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Línea / Micro:</span>
                <strong>{managingComplaint.lineName || '7A'} {managingComplaint.busId ? `(${managingComplaint.busId})` : ''}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Categoría:</span>
                <strong>{CATEGORY_CONFIG[managingComplaint.category]?.label || managingComplaint.category}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Calificación Pasajero:</span>
                <div style={{ display: 'flex', color: '#f59e0b', gap: '2px', marginTop: '2px' }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <FaStar key={s} size={12} color={s <= (managingComplaint.rating || 0) ? '#f59e0b' : '#475569'} />
                  ))}
                  <span style={{ marginLeft: '4px', fontWeight: 700 }}>({managingComplaint.rating || 0}/5)</span>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Fecha de Emisión:</span>
                <span>{new Date(managingComplaint.createdAt).toLocaleString('es-CL')}</span>
              </div>
            </div>

            {/* Descripción del Pasajero */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Descripción reportada por el usuario:
              </label>
              <div style={{
                background: 'var(--color-surface-2)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}>
                {managingComplaint.description || 'Sin comentarios adicionales'}
              </div>
            </div>

            {/* Formulario de Resolución */}
            <form onSubmit={handleSaveResolution} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Nuevo Estado del Incidente
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['IN_REVIEW', 'RESOLVED', 'REJECTED'] as ComplaintStatus[]).map((st) => {
                    const isSelected = targetStatus === st;
                    const cfg = STATUS_CONFIG[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTargetStatus(st)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? `2px solid ${cfg.color}` : '1px solid var(--color-border)',
                          background: isSelected ? cfg.bg : 'var(--color-surface-2)',
                          color: isSelected ? cfg.color : 'var(--color-text-secondary)',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        {st === 'IN_REVIEW' && '🔍 En Revisión'}
                        {st === 'RESOLVED' && '✅ Resolver'}
                        {st === 'REJECTED' && '❌ Rechazar'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="admin-response-textarea" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Respuesta Oficial de la Administración (adminResponse)
                </label>
                <textarea
                  id="admin-response-textarea"
                  rows={4}
                  placeholder="Detalla las medidas tomadas (ej: inspección de aforo en taller, amonestación a operador, etc.)..."
                  value={adminResponseText}
                  onChange={(e) => setAdminResponseText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    lineHeight: 1.4,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Botones de acción modal */}
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={handleCloseResolutionModal}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  id="save-resolution-btn"
                  type="submit"
                  disabled={isSubmittingResolution}
                  style={{
                    flex: 2,
                    padding: '10px',
                    background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: isSubmittingResolution ? 'not-allowed' : 'pointer',
                    opacity: isSubmittingResolution ? 0.7 : 1,
                  }}
                >
                  {isSubmittingResolution ? 'Guardando...' : 'Guardar Resolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
