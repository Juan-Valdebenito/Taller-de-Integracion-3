import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import {
  FaTimes,
  FaCreditCard,
  FaUserGraduate,
  FaSignOutAlt,
  FaBolt,
  FaTrash,
  FaTools,
  FaExclamationTriangle,
} from 'react-icons/fa';
import './DevToolsSimulationPanel.css';

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

export type SimulationEventType =
  | 'tap_in_normal'
  | 'tap_in_student'
  | 'sensor_alight'
  | 'fill_max'
  | 'reset_empty'
  | 'fill_capacity'
  | 'empty_capacity';

interface DevToolsSimulationPanelProps {
  socket: Socket | null;
  buses: BusSimulationState[];
  selectedBusId?: string;
  onSelectBus?: (busId: string) => void;
  onLocalEvent?: (busId: string, eventType: SimulationEventType) => void;
}

export const DevToolsSimulationPanel: React.FC<DevToolsSimulationPanelProps> = ({
  socket,
  buses,
  selectedBusId,
  onSelectBus,
  onLocalEvent,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeBusId, setActiveBusId] = useState<string>('B-7A-01');
  const [localLog, setLocalLog] = useState<string>(
    'Consola lista. Inyecta eventos para probar el modelo de aforo en tiempo real.'
  );
  const [isSending, setIsSending] = useState(false);

  // Lista canónica de los 3 microbuses de Temuco según especificación
  const CANONICAL_BUSES = [
    { id: 'B-7A-01', line: '7A', label: 'Línea 7A (B-7A-01)' },
    { id: 'B-7B-01', line: '7B', label: 'Línea 7B (B-7B-01)' },
    { id: 'B-1C-01', line: '1C', label: 'Línea 1C (B-1C-01)' },
  ];

  const currentBusId = selectedBusId || activeBusId;
  const currentBus =
    buses.find((b) => b.id === currentBusId) ||
    buses[0] || {
      id: currentBusId,
      line: '7A',
      currentPassengers: 0,
      capacity: 35,
      occupancyPercentage: 0,
      boardings: 0,
      schoolBoardings: 0,
      alightings: 0,
      isFull: false,
    };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setActiveBusId(newId);
    if (onSelectBus) {
      onSelectBus(newId);
    }
  };

  const handleInjectEvent = async (eventType: SimulationEventType) => {
    if (!currentBus || isSending) return;
    setIsSending(true);

    const eventNames: Record<string, string> = {
      tap_in_normal: '💳 Tarjeta Bip Normal (+$700 CLP)',
      tap_in_student: '🎓 Pase Escolar TNE (+$240 CLP)',
      sensor_alight: '📷 Sensor Salida Cámara (-1)',
      fill_max: '⚡ Llenar a Capacidad Máxima (35)',
      fill_capacity: '⚡ Llenar a Capacidad Máxima (35)',
      reset_empty: '🧹 Vaciar Microbús (0 pasajeros)',
      empty_capacity: '🧹 Vaciar Microbús (0 pasajeros)',
    };

    setLocalLog(`Enviando evento: ${eventNames[eventType] || eventType}...`);

    try {
      // 1. WebSocket directo si está conectado
      if (socket && socket.connected) {
        socket.emit('bus:simulate:event', {
          busId: currentBus.id,
          eventType,
        });
        setLocalLog(`✓ WebSocket: ${eventNames[eventType] || eventType}`);
      } else if (onLocalEvent) {
        // 2. Simulación local reactiva (cuando se corre Go sin WebSocket)
        onLocalEvent(currentBus.id, eventType);
        setLocalLog(`✓ Simulación local: ${eventNames[eventType] || eventType}`);
      } else {
        // 3. Fallback REST
        const res = await axios.post('http://localhost:3001/api/v1/buses/simulate-event', {
          busId: currentBus.id,
          eventType,
        });

        if (res.data?.data?.lastEvent?.description) {
          setLocalLog(`✓ REST: ${res.data.data.lastEvent.description}`);
        } else {
          setLocalLog(`✓ REST OK: ${eventNames[eventType] || eventType}`);
        }
      }
    } catch (err: any) {
      if (onLocalEvent) {
        onLocalEvent(currentBus.id, eventType);
        setLocalLog(`✓ Simulación local: ${eventNames[eventType] || eventType}`);
      } else {
        setLocalLog(`❌ Error: ${err.message || 'No se pudo enviar el evento'}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  const passengers = currentBus.currentPassengers ?? 0;
  const capacity = currentBus.capacity ?? 35;
  const percentage =
    capacity > 0
      ? Math.round(((passengers / capacity) * 100) * 10) / 10
      : 0;
  const isBusFull = currentBus.isFull || passengers >= capacity;

  // Umbrales requeridos:
  // Verde: < 60%
  // Amarillo: 60% - 89%
  // Rojo crítico: >= 90%
  let thresholdBadgeClass = 'badge-threshold-green';
  let thresholdFillClass = 'fill-threshold-green';
  let thresholdText = 'Aforo Bajo';

  if (percentage >= 90 || isBusFull) {
    thresholdBadgeClass = 'badge-threshold-red';
    thresholdFillClass = 'fill-threshold-red';
    thresholdText = 'Crítico (>=90%)';
  } else if (percentage >= 60) {
    thresholdBadgeClass = 'badge-threshold-yellow';
    thresholdFillClass = 'fill-threshold-yellow';
    thresholdText = 'Medio (60-89%)';
  }

  // Estimación de recaudación para contexto de transporte
  const normalFare = (currentBus.boardings ?? 0) * 700;
  const studentFare = (currentBus.schoolBoardings ?? 0) * 240;
  const totalRevenueCLP = normalFare + studentFare;

  if (!isOpen) {
    return (
      <div className="devtools-container">
        <button
          className="devtools-floating-toggle"
          onClick={() => setIsOpen(true)}
          title="Abrir Panel DevTools de Simulación"
        >
          <span className="toggle-pulse" />
          <FaTools />
          <span>DevTools Simulación</span>
        </button>
      </div>
    );
  }

  return (
    <div className="devtools-container">
      <div className="devtools-window">
        {/* Encabezado */}
        <div className="devtools-header">
          <div className="devtools-header-title">
            <FaTools className="header-icon" />
            <span>DevTools Simulación</span>
          </div>
          <div className="devtools-header-actions">
            <span className="devtools-badge-live">
              <span className="toggle-pulse" style={{ width: 6, height: 6 }} />
              EN VIVO
            </span>
            <button
              className="devtools-btn-close"
              onClick={() => setIsOpen(false)}
              title="Colapsar panel"
            >
              <FaTimes size={15} />
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="devtools-body">
          {/* Selector desplegable de microbús */}
          <div className="devtools-selector-group">
            <label className="devtools-label">Microbús Activo</label>
            <select
              className="devtools-select"
              value={currentBus.id}
              onChange={handleSelectChange}
            >
              {CANONICAL_BUSES.map((b) => {
                const liveData = buses.find((bus) => bus.id === b.id);
                const passCount = liveData ? liveData.currentPassengers : '?';
                return (
                  <option key={b.id} value={b.id}>
                    {b.label} — {passCount}/35 pas.
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tarjeta de Telemetría en Vivo */}
          <div className="devtools-telemetry-card">
            <div className="telemetry-row-main">
              <div className="telemetry-bus-meta">
                <span className="telemetry-bus-id">
                  {currentBus.id} • Línea {currentBus.line}
                </span>
                <div className="telemetry-passengers-count">
                  {passengers}{' '}
                  <span className="telemetry-passengers-max">/ {capacity} pasajeros</span>
                </div>
              </div>

              {/* Insignia visual: si está lleno muestra ALERTA DE SOBRECUPO */}
              {isBusFull ? (
                <span className="telemetry-badge badge-full-alert">
                  <FaExclamationTriangle /> LLENO / ALERTA DE SOBRECUPO
                </span>
              ) : (
                <span className={`telemetry-badge ${thresholdBadgeClass}`}>
                  {thresholdText} ({percentage}%)
                </span>
              )}
            </div>

            {/* Barra de progreso coloreada por umbral */}
            <div className="telemetry-progress-track">
              <div
                className={`telemetry-progress-fill ${thresholdFillClass}`}
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />
            </div>

            {/* Métricas secundarias */}
            <div className="telemetry-metrics-grid">
              <div className="metric-pill">
                <span className="metric-pill-label">Subidas</span>
                <span className="metric-pill-val">{currentBus.boardings ?? 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-pill-label">Escolares</span>
                <span className="metric-pill-val">{currentBus.schoolBoardings ?? 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-pill-label">Bajadas</span>
                <span className="metric-pill-val">{currentBus.alightings ?? 0}</span>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'right', marginTop: '2px' }}>
              Tarifa recaudada: <strong style={{ color: '#38bdf8' }}>${totalRevenueCLP.toLocaleString('es-CL')} CLP</strong>
            </div>
          </div>

          {/* Botones interactivos de inyección de eventos */}
          <div className="devtools-actions-container">
            <span className="devtools-label">Inyección de Eventos</span>

            <div className="actions-grid-primary">
              <button
                className="action-btn btn-bip"
                onClick={() => handleInjectEvent('tap_in_normal')}
                disabled={passengers >= capacity || isSending}
                title="Simula un pasajero pagando tarifa normal ($700 CLP)"
              >
                <FaCreditCard />
                <span>Bip Normal (+1)</span>
              </button>

              <button
                className="action-btn btn-student"
                onClick={() => handleInjectEvent('tap_in_student')}
                disabled={passengers >= capacity || isSending}
                title="Simula un estudiante con Pase Escolar TNE ($240 CLP)"
              >
                <FaUserGraduate />
                <span>Pase Escolar (+1)</span>
              </button>
            </div>

            <div className="actions-grid-secondary">
              <button
                className="action-btn btn-alight"
                onClick={() => handleInjectEvent('sensor_alight')}
                disabled={passengers <= 0 || isSending}
                title="Simula descenso detectado por sensor de cámara (-1)"
              >
                <FaSignOutAlt />
                <span>Sensor Salida (-1)</span>
              </button>

              <button
                className="action-btn btn-fill"
                onClick={() => handleInjectEvent('fill_max')}
                disabled={isSending}
                title="Ajusta el aforo a 35 pasajeros de inmediato"
              >
                <FaBolt />
                <span>Llenar (35)</span>
              </button>

              <button
                className="action-btn btn-reset"
                onClick={() => handleInjectEvent('reset_empty')}
                disabled={isSending}
                title="Reinicia el aforo a 0 pasajeros"
              >
                <FaTrash />
                <span>Vaciar (0)</span>
              </button>
            </div>
          </div>

          {/* Consola de Último Evento */}
          <div className="devtools-log-section">
            <span className="devtools-label">Último Evento Recibido</span>
            <div className="devtools-terminal-log">
              {currentBus.lastEvent ? (
                <>
                  <span className="log-time">[{currentBus.lastEvent.timestamp}]</span>
                  <span>{currentBus.lastEvent.description}</span>
                </>
              ) : (
                <span>{localLog}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Re-export con alias para máxima compatibilidad
export { DevToolsSimulationPanel as SimulationDevTools };
