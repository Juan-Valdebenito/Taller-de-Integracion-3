import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import './HazardModal.css';

interface HazardModalProps {
  isOpen: boolean;
  lat: number;
  lng: number;
  onClose: () => void;
  onCreate: (title: string, description: string) => void;
}

export const HazardModal: React.FC<HazardModalProps> = ({
  isOpen,
  lat,
  lng,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Por favor escribe un título para el aviso.');
      return;
    }
    onCreate(title.trim(), description.trim());
    handleClose();
  };

  const coordsLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">⚠️ Reportar Peligro</h2>
          <button onClick={handleClose} className="modal-close">
            <FaTimes size={20} />
          </button>
        </div>

        <div className="modal-info-bar">
          <span>Ubicación: <strong>{coordsLabel}</strong></span>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Título</label>
            <input
              className="form-input"
              type="text"
              placeholder="Ej: Bache peligroso, calle en mal estado..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Descripción (Opcional)</label>
            <textarea
              className="form-textarea"
              placeholder="Detalla el hazard para otros usuarios..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="submit-btn">
            Publicar Aviso
          </button>
        </form>
      </div>
    </div>
  );
};