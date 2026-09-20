import { useState, useEffect } from 'react';
import axios from 'axios';
import { FaExclamationTriangle, FaCheckCircle, FaClock, FaStar, FaFilter, FaSync } from 'react-icons/fa';


export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: 'OVERCROWDING' | 'DELAY' | 'DRIVER_BEHAVIOR' | 'VEHICLE_CONDITION' | 'ACCESSIBILITY' | 'OTHER';
  rating: number;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  adminResponse: string | null;
  busId: string | null;
  lineName: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  OVERCROWDING: '⚠️ Sobrecupo / Aforo',
  DELAY: '⏱️ Demora / Frecuencia',
  DRIVER_BEHAVIOR: '🛑 Conducción / Chofer',
  VEHICLE_CONDITION: '🧹 Estado Vehículo',
  ACCESSIBILITY: '♿ Accesibilidad',
  OTHER: 'ℹ️ Otro Incidente',
};

export function AdminDashboardPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Estado para modal/campo de respuesta
  const [activeComplaint, setActiveComplaint] = useState<Complaint | null>(null);
  const [adminReplyText, setAdminReplyText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchComplaints = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('http://localhost:3001/api/v1/complaints');
      if (res.data?.data) {
        setComplaints(res.data.data);
      }
    } catch (err) {
      console.error('Error al cargar reclamos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const handleUpdateStatus = async (complaintId: string, newStatus: string, replyMessage?: string) => {
    setIsUpdating(true);
    try {
      await axios.patch(`http://localhost:3001/api/v1/complaints/${complaintId}/status`, {
        status: newStatus,
        adminResponse: replyMessage !== undefined ? replyMessage : activeComplaint?.adminResponse,
      });

      setActionSuccessMsg(`Incidente actualizado a estado ${newStatus}`);
      setTimeout(() => setActionSuccessMsg(null), 3000);
      setActiveComplaint(null);
      setAdminReplyText('');
      await fetchComplaints();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al actualizar el estado del reclamo');
    } finally {
      setIsUpdating(false);
    }
  };

  // Filtrado
  const filtered = complaints.filter((c) => {
    if (selectedStatus !== 'ALL' && c.status !== selectedStatus) return false;
    if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
    return true;
  });

  // Métricas
  const totalCount = complaints.length;
  const pendingCount = complaints.filter(c => c.status === 'PENDING').length;
  const reviewCount = complaints.filter(c => c.status === 'IN_REVIEW').length;
  const resolvedCount = complaints.filter(c => c.status === 'RESOLVED').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { label: 'PENDIENTE', bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '#ca8a04' };
      case 'IN_REVIEW':
        return { label: 'EN REVISIÓN', bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '#0284c7' };
      case 'RESOLVED':
        return { label: 'RESUELTO', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '#16a34a' };
      case 'REJECTED':
        return { label: 'RECHAZADO', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '#dc2626' };
      default:
        return { label: status, bg: '#334155', color: '#cbd5e1', border: '#475569' };
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--color-text)' }}>
            Protocolo de Gestión y Clasificación de Reclamos
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            Supervisión, trazabilidad y resolución de incidentes en tiempo real para las líneas 7A, 7B y 1C.
          </p>
        </div>
        <button
          onClick={fetchComplaints}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <FaSync className={isLoading ? 'fa-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {actionSuccessMsg && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.15)',
          color: '#4ade80',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <FaCheckCircle />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Tarjetas KPI de Estado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Total Reclamos</span>
            <span style={{ fontSize: '18px' }}>📋</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px' }}>{totalCount}</div>
        </div>

        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#facc15', fontWeight: 600 }}>Pendientes</span>
            <FaClock color="#facc15" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: '#facc15' }}>{pendingCount}</div>
        </div>

        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>En Revisión</span>
            <FaExclamationTriangle color="#38bdf8" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: '#38bdf8' }}>{reviewCount}</div>
        </div>

        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#4ade80', fontWeight: 600 }}>Resueltos</span>
            <FaCheckCircle color="#4ade80" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: '#4ade80' }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
          <FaFilter color="var(--color-text-secondary)" />
          <span>Filtrar:</span>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginRight: '8px' }}>Estado:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'inherit',
              fontSize: '13px',
            }}
          >
            <option value="ALL">Todos los estados</option>
            <option value="PENDING">Pendientes</option>
            <option value="IN_REVIEW">En Revisión</option>
            <option value="RESOLVED">Resueltos</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginRight: '8px' }}>Categoría:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'inherit',
              fontSize: '13px',
            }}
          >
            <option value="ALL">Todas las categorías</option>
            <option value="OVERCROWDING">Sobrecupo / Aforo</option>
            <option value="DELAY">Demora / Frecuencia</option>
            <option value="DRIVER_BEHAVIOR">Conducción / Trato</option>
            <option value="VEHICLE_CONDITION">Estado del Vehículo</option>
            <option value="ACCESSIBILITY">Accesibilidad</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
      </div>

      {/* Lista / Tabla de Incidentes */}
      <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Cargando incidentes...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No se encontraron incidentes con los filtros seleccionados.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((item) => {
              const badge = getStatusBadge(item.status);
              const isSelected = activeComplaint?.id === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    padding: '16px 20px',
                    transition: 'background 0.2s',
                    background: isSelected ? 'var(--color-surface-2)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>

                        <span style={{ fontSize: '12px', color: '#94a3b8', background: '#0f172a', padding: '2px 8px', borderRadius: '4px' }}>
                          {CATEGORY_NAMES[item.category] || item.category}
                        </span>

                        {item.lineName && (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                            Línea {item.lineName}
                          </span>
                        )}

                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {new Date(item.createdAt).toLocaleString('es-CL')}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '4px 0 6px 0' }}>
                        {item.title}
                      </h3>

                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                        {item.description}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', color: '#f59e0b', fontSize: '12px' }}>
                          {[...Array(5)].map((_, i) => (
                            <FaStar key={i} color={i < (item.rating || 0) ? '#f59e0b' : '#475569'} />
                          ))}
                        </div>
                        {item.busId && (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            Bus: <code>{item.busId}</code>
                          </span>
                        )}
                      </div>

                      {/* Respuesta Oficial del Admin si existe */}
                      {item.adminResponse && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          background: 'rgba(30, 41, 59, 0.7)',
                          borderLeft: '3px solid #38bdf8',
                          borderRadius: '0 6px 6px 0',
                          fontSize: '12px',
                        }}>
                          <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '2px' }}>
                            Resolución Oficial de la Administración:
                          </strong>
                          <span style={{ color: '#e2e8f0' }}>{item.adminResponse}</span>
                        </div>
                      )}
                    </div>

                    {/* Botones de Acción de Estado */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px' }}>
                      <button
                        onClick={() => {
                          setActiveComplaint(isSelected ? null : item);
                          setAdminReplyText(item.adminResponse || '');
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          background: isSelected ? '#2563eb' : 'var(--color-surface-2)',
                          color: isSelected ? '#ffffff' : 'inherit',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? 'Cerrar Gestión' : 'Gestionar Estado'}
                      </button>
                    </div>
                  </div>

                  {/* Panel desplegable de Gestión y Resolución */}
                  {isSelected && (
                    <div style={{
                      marginTop: '16px',
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                        Cambiar Estado del Protocolo:
                      </h4>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <button
                          onClick={() => handleUpdateStatus(item.id, 'IN_REVIEW', adminReplyText)}
                          disabled={isUpdating || item.status === 'IN_REVIEW'}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: '#0284c7',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: item.status === 'IN_REVIEW' ? 0.5 : 1,
                          }}
                        >
                          ⏳ Pasar a EN REVISIÓN
                        </button>

                        <button
                          onClick={() => handleUpdateStatus(item.id, 'RESOLVED', adminReplyText || 'Incidente investigado y medidas correctivas aplicadas.')}
                          disabled={isUpdating || item.status === 'RESOLVED'}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: '#16a34a',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: item.status === 'RESOLVED' ? 0.5 : 1,
                          }}
                        >
                          ✅ Marcar como RESUELTO
                        </button>

                        <button
                          onClick={() => handleUpdateStatus(item.id, 'REJECTED', adminReplyText || 'Desestimado por falta de antecedentes.')}
                          disabled={isUpdating || item.status === 'REJECTED'}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: item.status === 'REJECTED' ? 0.5 : 1,
                          }}
                        >
                          ❌ RECHAZAR / Desestimar
                        </button>

                        <button
                          onClick={() => handleUpdateStatus(item.id, 'PENDING', adminReplyText)}
                          disabled={isUpdating || item.status === 'PENDING'}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: '#475569',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: item.status === 'PENDING' ? 0.5 : 1,
                          }}
                        >
                          🔄 Reabrir (PENDIENTE)
                        </button>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                          Nota / Respuesta Oficial de la Administración:
                        </label>
                        <textarea
                          rows={3}
                          value={adminReplyText}
                          onChange={(e) => setAdminReplyText(e.target.value)}
                          placeholder="Escribe la resolución o medidas adoptadas..."
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface-2)',
                            color: 'inherit',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                            marginBottom: '8px',
                          }}
                        />
                        <button
                          onClick={() => handleUpdateStatus(item.id, item.status, adminReplyText)}
                          disabled={isUpdating}
                          style={{
                            padding: '8px 16px',
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {isUpdating ? 'Guardando...' : 'Guardar Respuesta Oficial'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
