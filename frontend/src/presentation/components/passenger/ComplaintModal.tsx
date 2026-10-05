import React, { useEffect, useState } from 'react';
import { FaStar, FaRegStar, FaTimes } from 'react-icons/fa';
import { apiClient } from '../../../infrastructure/api/apiClient';
import './ComplaintModal.css';

interface ComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  busId: string;
  lineName: string;
}

interface RouteOption {
  id: string;
  name: string;
  code: string;
}

const CATEGORIES = [
  { value: 'OVERCROWDING', label: '⚠️ Sobrecupo / Exceso de Aforo' },
  { value: 'DELAY', label: '⏱️ Frecuencia / Demora Excesiva' },
  { value: 'DRIVER_BEHAVIOR', label: '🛑 Conducción Imprudente / Trato Conductor' },
  { value: 'VEHICLE_CONDITION', label: '🧹 Estado del Vehículo / Aseo' },
  { value: 'ACCESSIBILITY', label: '♿ Problemas de Accesibilidad' },
  { value: 'OTHER', label: 'ℹ️ Otro Motivo' },
];

const DEFAULT_CATEGORY = 'OVERCROWDING';

export const ComplaintModal: React.FC<ComplaintModalProps> = ({
  isOpen,
  onClose,
  busId,
  lineName
}) => {
  const [title, setTitle] = useState<string>('');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [comment, setComment] = useState<string>('');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeId, setRouteId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Al abrir: título sugerido y rutas reales de la BD. Los buses del mapa son
  // simulados (no existen en la BD), así que el reclamo se asocia a una ruta:
  // se preselecciona la que tenga el mismo código que la línea, si existe.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(`Reclamo línea ${lineName || busId}`);
    apiClient.get<RouteOption[]>('/routes')
      .then((res) => {
        setRoutes(res.data);
        const match = res.data.find((r) => r.code.toLowerCase() === lineName.toLowerCase());
        setRouteId(match?.id ?? '');
      })
      .catch((err) => console.error('Error al cargar rutas:', err));
  }, [isOpen, lineName, busId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !comment.trim()) {
      setError('El título y la descripción son obligatorios.');
      return;
    }
    if (!category) {
      setError('Por favor selecciona una categoría.');
      return;
    }
    if (!routeId) {
      setError('Selecciona la ruta para identificar a la empresa responsable.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // La calificación es opcional; el backend no tiene campo para ella,
    // así que se agrega al final de la descripción.
    const description = rating > 0
      ? `${comment.trim()}\n\nCalificación del viaje: ${rating}/5 (micro ${busId})`
      : `${comment.trim()}\n\n(micro ${busId})`;

    try {
      await apiClient.post('/complaints', {
        title: title.trim(),
        description,
        category,
        routeId,
      });
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ocurrió un error al enviar el reclamo.');
    } finally {
      setIsLoading(false);
    }
  };


  const handleClose = () => {
    setSuccess(false);
    setTitle('');
    setRating(0);
    setCategory(DEFAULT_CATEGORY);
    setComment('');
    setRouteId('');
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Nuevo Reclamo</h2>
          <button onClick={handleClose} className="modal-close">
            <FaTimes size={20} />
          </button>
        </div>

        <div className="modal-info-bar">
          <span>Micro: <strong>{busId}</strong></span>
          <span>Línea: <strong>{lineName}</strong></span>
        </div>

        {success ? (
          <div className="success-container">
            <div className="success-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h3 className="success-title">¡Reclamo enviado!</h3>
            <p className="success-subtitle">Puedes seguir su estado en "Mis Reclamos".</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {/* Título */}
            <div className="form-group">
              <label>Título</label>
              <input
                type="text"
                className="form-select"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Categoría */}
            <div className="form-group">
              <label>Motivo / Categoría</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isLoading}
              >
                <option value="" disabled>Selecciona una opción...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Ruta */}
            <div className="form-group">
              <label>Ruta</label>
              <select
                className="form-select"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Selecciona la ruta...</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>{route.code} - {route.name}</option>
                ))}
              </select>
            </div>

            {/* Sistema de Estrellas (opcional) */}
            <div className="star-rating-container">
              <span className="star-label">¿Cómo evaluarías el viaje? (opcional)</span>
              <div className="stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="star-btn"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                  >
                    {star <= (hoverRating || rating) ? <FaStar /> : <FaRegStar />}
                  </button>
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div className="form-group">
              <label>Descripción</label>
              <textarea
                className="form-textarea"
                placeholder="Detalla lo ocurrido..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="submit-btn"
            >
              {isLoading ? 'Enviando...' : 'Enviar Reclamo'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
