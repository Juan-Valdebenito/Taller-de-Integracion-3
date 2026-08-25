import React, { useState } from 'react';
import { FaStar, FaRegStar, FaTimes } from 'react-icons/fa';
import axios from 'axios';
import './ComplaintModal.css';

interface ComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  busId: string;
  lineName: string;
}

const CATEGORIES = [
  'Conducción',
  'Frecuencia/Demora',
  'Cobro/Validación',
  'Trato conductor',
  'Otro'
];

export const ComplaintModal: React.FC<ComplaintModalProps> = ({ 
  isOpen, 
  onClose, 
  busId, 
  lineName 
}) => {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Por favor selecciona una calificación.');
      return;
    }
    if (!category) {
      setError('Por favor selecciona una categoría.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Usamos el endpoint definido en el backend actual
      await axios.post('http://localhost:3001/api/v1/complaints', {
        busId,
        // Adaptado al modelo sugerido previamente para el backend Go, 
        // pero mapeado a lo que podría esperar el backend actual Node.
        title: `Reclamo Línea ${lineName}`,
        description: comment || 'Sin comentarios adicionales',
        category: category,
        rating: rating,
        lineName: lineName
      });
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Ocurrió un error al enviar el reclamo (Endpoint no implementado aún).');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setRating(0);
    setCategory('');
    setComment('');
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Calificar Viaje</h2>
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
            <h3 className="success-title">¡Gracias por tu comentario!</h3>
            <p className="success-subtitle">Ayudas a mejorar el servicio en Temuco.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {/* Sistema de Estrellas */}
            <div className="star-rating-container">
              <span className="star-label">¿Cómo evaluarías el viaje?</span>
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

            {/* Categoría */}
            <div className="form-group">
              <label>Motivo / Categoría</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="" disabled>Selecciona una opción...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Comentario Adicional */}
            <div className="form-group">
              <label>Comentario (Opcional)</label>
              <textarea
                className="form-textarea"
                placeholder="Detalla tu experiencia..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="submit-btn"
            >
              {isLoading ? 'Enviando...' : 'Enviar Calificación'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
