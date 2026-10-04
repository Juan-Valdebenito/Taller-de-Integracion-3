import React, { useState, useEffect } from 'react';
import { FaStar, FaRegStar, FaTimes, FaCheckCircle } from 'react-icons/fa';
import axios from 'axios';
import './ComplaintModal.css';

interface ComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  busId: string;
  lineName: string;
}

const CATEGORIES = [
  { value: 'OVERCROWDING', label: '⚠️ Sobrecupo / Exceso de Aforo' },
  { value: 'DELAY', label: '⏱️ Frecuencia / Demora Excesiva' },
  { value: 'DRIVER_BEHAVIOR', label: '🛑 Conducción Imprudente / Trato Conductor' },
  { value: 'FARES_PAYMENT', label: '💳 Pago de Tarifa / Bipay / Cobro' },
  { value: 'VEHICLE_CONDITION', label: '🧹 Estado del Vehículo / Aseo' },
  { value: 'ACCESSIBILITY', label: '♿ Problemas de Accesibilidad' },
  { value: 'OTHER', label: 'ℹ️ Otro Motivo' },
];

const MAX_COMMENT_LENGTH = 300;

export const ComplaintModal: React.FC<ComplaintModalProps> = ({ 
  isOpen, 
  onClose, 
  busId, 
  lineName 
}) => {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<string>('OVERCROWDING');
  const [comment, setComment] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Normalizar línea para coincidir con 7A, 7B, 1C
  const normalizedLine = (lineName || '7A').toUpperCase().replace('LÍNEA', '').trim() || '7A';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Por favor selecciona una calificación de 1 a 5 estrellas.');
      return;
    }
    if (!category) {
      setError('Por favor selecciona una categoría válida.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const payload = {
        busId: busId || 'B-7A-01',
        lineName: normalizedLine,
        companyId: 'comp-temuco-01',
        title: `Reporte Micro ${busId || normalizedLine} - Línea ${normalizedLine}`,
        description: comment.trim() || 'Sin comentarios adicionales',
        motivo: comment.trim() || 'Reporte de servicio de transporte',
        category: category,
        rating: rating,
      };

      await axios.post('http://localhost:3001/api/v1/complaints', payload, { headers });

      setToastMessage('Reclamo registrado exitosamente');
      setSuccess(true);

      setTimeout(() => {
        handleClose();
      }, 2200);
    } catch (err: any) {
      const serverErr = err.response?.data?.errors?.[0]?.message || 
                        err.response?.data?.error || 
                        err.response?.data?.message || 
                        'Ocurrió un error al enviar el reclamo.';
      setError(serverErr);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setToastMessage(null);
    setRating(0);
    setHoverRating(0);
    setCategory('OVERCROWDING');
    setComment('');
    setError(null);
    onClose();
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={handleClose} 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="complaint-modal-title"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Toast Notificación Reactiva */}
        {toastMessage && (
          <div 
            id="complaint-success-toast" 
            style={{
              position: 'absolute',
              top: '-50px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, hsl(142,71%,40%), hsl(142,71%,30%))',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 100,
              whiteSpace: 'nowrap',
              animation: 'fade-in-up 0.3s ease',
            }}
          >
            <FaCheckCircle />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="modal-header">
          <h2 id="complaint-modal-title" className="modal-title">Calificar Viaje</h2>
          <button 
            onClick={handleClose} 
            className="modal-close" 
            aria-label="Cerrar ventana de reclamo"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Barra de contexto: precarga de micro y línea */}
        <div className="modal-info-bar">
          <span>Micro: <strong>{busId || 'B-7A-01'}</strong></span>
          <span>Línea: <strong>{normalizedLine}</strong></span>
        </div>

        {success ? (
          <div className="success-container">
            <div className="success-icon">
              <FaCheckCircle size={48} color="hsl(142,71%,45%)" />
            </div>
            <h3 className="success-title">¡Reclamo registrado exitosamente!</h3>
            <p className="success-subtitle">Gracias por contribuir a la calidad del transporte en Temuco.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {/* Selector de Estrellas (1 a 5) */}
            <div className="star-rating-container">
              <span className="star-label">¿Cómo evaluarías el servicio? (1 a 5 estrellas)</span>
              <div className="stars" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="star-btn"
                    aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      setRating(star);
                      setError(null);
                    }}
                  >
                    {star <= (hoverRating || rating) ? (
                      <FaStar style={{ color: '#f59e0b' }} />
                    ) : (
                      <FaRegStar style={{ color: '#64748b' }} />
                    )}
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, marginTop: '4px' }}>
                  {rating === 1 && '⭐ Muy deficiente'}
                  {rating === 2 && '⭐⭐ Regular / Deficiente'}
                  {rating === 3 && '⭐⭐⭐ Aceptable'}
                  {rating === 4 && '⭐⭐⭐⭐ Buen servicio'}
                  {rating === 5 && '⭐⭐⭐⭐⭐ Excelente'}
                </span>
              )}
            </div>

            {/* Selector de Categorías Estandarizadas */}
            <div className="form-group">
              <label htmlFor="complaint-category-select">Categoría del Reclamo / Incidente</label>
              <select
                id="complaint-category-select"
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Textarea con Contador de Caracteres */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor="complaint-comment-textarea" style={{ margin: 0 }}>
                  Descripción de la experiencia (Opcional)
                </label>
                <span 
                  id="char-counter"
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: 600, 
                    color: comment.length >= MAX_COMMENT_LENGTH ? '#ef4444' : 'var(--color-text-secondary)' 
                  }}
                >
                  {comment.length} / {MAX_COMMENT_LENGTH}
                </span>
              </div>
              <textarea
                id="complaint-comment-textarea"
                className="form-textarea"
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Detalla qué sucedió durante el recorrido (aforo, conductor, retraso...)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {error && (
              <p className="error-msg" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}

            {/* Botón de Envío */}
            <button
              id="submit-complaint-btn"
              type="submit"
              disabled={isLoading || rating === 0}
              className="submit-btn"
              style={{
                opacity: (isLoading || rating === 0) ? 0.6 : 1,
                cursor: (isLoading || rating === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? 'Registrando Reclamo...' : 'Enviar Reclamo'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
