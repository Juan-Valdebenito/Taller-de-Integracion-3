import React, { useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { HazardData } from './LiveMap';

const VOTES_STORAGE_KEY = 'hazard:voted';

const getVotedIds = (): string[] => {
  try {
    const raw = localStorage.getItem(VOTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const createHazardIcon = (): L.DivIcon => {
  const html = `
    <div class="hazard-marker-icon">
      <span>⚠️</span>
    </div>
  `;

  return new L.DivIcon({
    html,
    className: 'hazard-marker-container',
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    popupAnchor: [0, -34],
  });
};

interface HazardMarkerProps {
  hazard: HazardData;
  onUseful: (id: string) => boolean;
  onResolve: (id: string) => void;
}

export const HazardMarker: React.FC<HazardMarkerProps> = ({ hazard, onUseful, onResolve }) => {
  const [hasVoted, setHasVoted] = useState<boolean>(() => getVotedIds().includes(hazard.id));

  const icon = useMemo(() => createHazardIcon(), []);

  const handleUseful = () => {
    if (hasVoted) return;
    if (onUseful(hazard.id)) {
      setHasVoted(true);
    }
  };

  const dateLabel = new Date(hazard.createdAt).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Marker
      position={[hazard.lat, hazard.lng]}
      icon={icon}
      bubblingMouseEvents={false}
    >
      <Popup>
        <div className="hazard-popup">
          <div className="hazard-popup-title">⚠️ {hazard.title}</div>
          <p className="hazard-popup-date">
            Reportado el {dateLabel}
          </p>
          {hazard.description && (
            <p className="hazard-popup-desc">{hazard.description}</p>
          )}
          <div className="hazard-popup-votes">
            <span className="hazard-vote-count">👍 {hazard.usefulVotes}</span>
            <span className="hazard-vote-hint">
              {hasVoted ? 'Gracias por tu voto' : '¿Te fue útil este aviso?'}
            </span>
          </div>
          <div className="hazard-popup-actions">
            <button
              className={`hazard-btn useful ${hasVoted ? 'voted' : ''}`}
              onClick={handleUseful}
              disabled={hasVoted}
            >
              {hasVoted ? '✓ Te fue útil' : '👍 Útil'}
            </button>
            <button
              className="hazard-btn resolve"
              onClick={() => onResolve(hazard.id)}
            >
              ✓ Ya no está ahí
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};