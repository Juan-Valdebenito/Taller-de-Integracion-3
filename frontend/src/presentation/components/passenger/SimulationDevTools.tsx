import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import { FaTimes, FaCreditCard, FaUserGraduate, FaSignOutAlt, FaBolt, FaTrash, FaTools } from 'react-icons/fa';
import './SimulationDevTools.css';

export interface BusSimulationState {
  id: string;
  line: string;
  lat: number;
  lng: number;
  status: string;
  capacity: number;
  currentPassengers: number;
  occupancyPercentage: number;
  boardings: number;
  schoolBoardings: number;
  alightings: number;
  isFull: boolean;
  lastEvent?: {
    type: string;
    description: string;
    timestamp: string;
  };
}

interface SimulationDevToolsProps {
  socket: Socket | null;
  buses: BusSimulationState[];
  selectedBusId?: string;
  onSelectBus?: (busId: string) => void;
}

export const SimulationDevTools: React.FC<SimulationDevToolsProps> = ({
  socket,
  buses,
  selectedBusId,
  onSelectBus,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeBusId, setActiveBusId] = useState<string>('B-7A-01');
  const [localLog, setLocalLog] = useState<string>('Panel de simulación listo. Selecciona una acción para inyectar.');

  // Usar el bus seleccionado externamente o el local
  const currentBusId = selectedBusId || activeBusId;
  const currentBus = buses.find((b) => b.id === currentBusId) || buses[0];

  const handleSelect = (id: string) => {
    setActiveBusId(id);
    if (onSelectBus) onSelectBus(id);
  };

  const handleInjectEvent = async (
    eventType: 'tap_in_normal' | 'tap_in_student' | 'sensor_alight' | 'fill_capacity' | 'empty_capacity'
  ) => {
    if (!currentBus) return;

    const eventNames: Record<string, string> = {
      tap_in_normal: '💳 Tarjeta Normal (+$700 CLP)',
      tap_in_student: '🎓 Tarjeta Estudiante TNE (+$240 CLP)',
      sensor_alight: '📷 Sensor Cámara Descenso (-1)',
      fill_capacity: '⚡ Forzar Capacidad Completa (35)',
      empty_capacity: '🧹 Forzar Vacío (0)',
    };

    setLocalLog(`Enviando: ${eventNames[eventType]}...`);

    // Intentar vía Socket.IO primero
    if (socket && socket.connected) {
      socket.emit('bus:simulate:event', {
        busId: currentBus.id,
        eventType,
      });
      setLocalLog(`✓ Emitido por WebSocket: ${eventNames[eventType]}`);
    } else {
      // Fallback REST si Socket no está disponible
      try {
        const res = await axios.post('http://localhost:3001/api/v1/buses/simulate-event', {
          busId: currentBus.id,
          eventType,
        });
        if (res.data?.data?.lastEvent?.description) {
          setLocalLog(res.data.data.lastEvent.description);
        } else {
          setLocalLog(`✓ REST OK: ${eventNames[eventType]}`);
        }
      } catch (err: any) {
        setLocalLog(`❌ Error al inyectar: ${err.message}`);
      }
    }
  };

  if (!isOpen) {
    return (
      <button 
        className="devtools-toggle-btn"
        onClick={() => setIsOpen(true)}
        title="Abrir Simulador de Sensores y Pagos"
      >
        <FaTools />
        <span>DevTools Simulación</span>
      </button>
    );
  }

  const occupancy = currentBus ? (currentBus.occupancyPercentage || 0) : 0;
  const passengers = currentBus ? (currentBus.currentPassengers || 0) : 0;
  const capacity = currentBus ? (currentBus.capacity || 35) : 35;

  let badgeClass = 'badge-low';
  let barClass = 'bar-low';
  let badgeLabel = 'Baja Ocupación';

  if (occupancy >= 95 || passengers >= capacity) {
    badgeClass = 'badge-full';
    barClass = 'bar-full';
    badgeLabel = 'COMPLETO (35)';
  } else if (occupancy >= 70) {
    badgeClass = 'badge-med';
    barClass = 'bar-med';
    badgeLabel = 'Media-Alta';
  }

  return (
    <div className="devtools-panel">
      <div className="devtools-header">
        <div className="devtools-title">
          <FaTools />
          <span>Inyector de Sensores y Pagos</span>
        </div>
        <button 
          className="devtools-close-btn"
          onClick={() => setIsOpen(false)}
          title="Minimizar panel"
        >
          <FaTimes size={16} />
        </button>
      </div>

      <div className="devtools-body">
        {/* Selector de microbús */}
        <div>
          <div className="devtools-section-title">Líneas en Simulación</div>
          <div className="devtools-bus-tabs">
            {['B-7A-01', 'B-7B-01', 'B-1C-01'].map((id) => {
              const busInfo = buses.find((b) => b.id === id);
              const lineLabel = busInfo ? busInfo.line : id.split('-')[1];
              const passCount = busInfo ? busInfo.currentPassengers : '?';
              return (
                <button
                  key={id}
                  className={`devtools-bus-tab ${currentBus?.id === id ? 'active' : ''}`}
                  onClick={() => handleSelect(id)}
                >
                  <span>Línea {lineLabel}</span>
                  <small style={{ fontSize: '10px', opacity: 0.85 }}>({passCount}/35)</small>
                </button>
              );
            })}
          </div>
        </div>

        {/* Indicador de Aforo con cotas rígidas 0-35 */}
        <div className="devtools-aforo-card">
          <div className="devtools-aforo-row">
            <div>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>
                Micro {currentBus?.id} ({currentBus?.line})
              </span>
              <span className="devtools-aforo-value">
                {passengers} <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>/ {capacity}</span>
              </span>
            </div>
            <span className={`devtools-aforo-badge ${badgeClass}`}>
              {badgeLabel} ({occupancy}%)
            </span>
          </div>

          <div className="devtools-progress-bg">
            <div 
              className={`devtools-progress-bar ${barClass}`}
              style={{ width: `${Math.min(100, Math.max(0, occupancy))}%` }}
            />
          </div>

          <div className="devtools-counts-grid">
            <div className="count-item">
              <span className="count-title">Subidas</span>
              <span className="count-val">{currentBus?.boardings ?? 0}</span>
            </div>
            <div className="count-item">
              <span className="count-title">Escolares</span>
              <span className="count-val">{currentBus?.schoolBoardings ?? 0}</span>
            </div>
            <div className="count-item">
              <span className="count-title">Bajadas Cam</span>
              <span className="count-val">{currentBus?.alightings ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Inyectores de eventos manuales */}
        <div>
          <div className="devtools-section-title">Inyectores Manuales de Eventos</div>
          <div className="devtools-actions-grid">
            <button
              className="devtools-action-btn btn-normal"
              onClick={() => handleInjectEvent('tap_in_normal')}
              disabled={passengers >= capacity}
              title="Simula un pasajero pagando tarifa normal en el validador"
            >
              <FaCreditCard />
              <span>Bip Normal (+1)</span>
            </button>

            <button
              className="devtools-action-btn btn-student"
              onClick={() => handleInjectEvent('tap_in_student')}
              disabled={passengers >= capacity}
              title="Simula un estudiante con TNE"
            >
              <FaUserGraduate />
              <span>Pase Escolar (+1)</span>
            </button>

            <button
              className="devtools-action-btn btn-alight"
              onClick={() => handleInjectEvent('sensor_alight')}
              disabled={passengers <= 0}
              title="Simula la detección de cámara en la puerta de salida"
            >
              <FaSignOutAlt />
              <span>Cámara Bajada (-1)</span>
            </button>

            <button
              className="devtools-action-btn btn-fill"
              onClick={() => handleInjectEvent('fill_capacity')}
              title="Forzar bus al límite de 35 pasajeros"
            >
              <FaBolt />
              <span>Llenar a 35</span>
            </button>

            <button
              className="devtools-action-btn btn-empty"
              onClick={() => handleInjectEvent('empty_capacity')}
              title="Vaciar todos los pasajeros"
            >
              <FaTrash />
              <span>Vaciar Bus (0 pasajeros)</span>
            </button>
          </div>
        </div>

        {/* Registro en vivo del evento */}
        <div>
          <div className="devtools-section-title">Último Evento Recibido</div>
          <div className="devtools-log-box">
            {currentBus?.lastEvent ? (
              <>
                <span style={{ color: '#94a3b8' }}>[{currentBus.lastEvent.timestamp}] </span>
                {currentBus.lastEvent.description}
              </>
            ) : (
              localLog
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
