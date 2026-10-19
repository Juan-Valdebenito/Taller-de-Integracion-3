/**
 * SimulationDevTools.tsx
 *
 * Panel flotante de simulación de sensores y pagos.
 *
 * Cambios vs versión anterior:
 * - Eliminada dependencia de Socket.io (socket: Socket | null)
 * - Eventos inyectados via sendMessage() del socketClient nativo (Go /ws)
 * - Fallback: WS nativo -> REST -> estado local
 * - Props adaptadas al nuevo BusState (latitude/longitude, routeId)
 * - Selector de bus dinámico con buses reales del mapa
 */

import React, { useState, useCallback } from 'react';
import { FaTimes, FaCreditCard, FaUserGraduate, FaSignOutAlt, FaBolt, FaTrash, FaTools, FaWifi } from 'react-icons/fa';
import {
  sendMessage,
  isConnected,
  type PublishMessage,
} from '../../../infrastructure/socket/socketClient';
import type { BusState } from '../../../hooks/useSimulatedBuses';
import type { ConnectionStatus } from '../../../hooks/useSocketBuses';
import './SimulationDevTools.css';

// Tipos de eventos soportados
type SimEventType =
  | 'tap_in_normal'
  | 'tap_in_student'
  | 'sensor_alight'
  | 'fill_capacity'
  | 'empty_capacity';

type DeltaType = 'board' | 'alight' | 'fill' | 'empty';

interface EventMeta {
  label: string;
  delta: DeltaType;
}

const EVENT_META: Record<SimEventType, EventMeta> = {
  tap_in_normal:  { label: 'Bip Normal (+1)',    delta: 'board' },
  tap_in_student: { label: 'Pase Escolar (+1)',  delta: 'board' },
  sensor_alight:  { label: 'Camara Bajada (-1)', delta: 'alight' },
  fill_capacity:  { label: 'Llenar capacidad',   delta: 'fill' },
  empty_capacity: { label: 'Vaciar bus (0)',     delta: 'empty' },
};

// Token de simulacion para el backend Go
const SIM_TOKEN = (import.meta as any).env?.VITE_SIM_TOKEN ?? 'sim-dev-token';

interface SimulationDevToolsProps {
  buses: BusState[];
  selectedBusId?: string | null;
  onSelectBus?: (busId: string) => void;
  wsStatus?: ConnectionStatus;
  onLocalEvent?: (busId: string, eventType: SimEventType) => void;
}

export const SimulationDevTools: React.FC<SimulationDevToolsProps> = ({
  buses,
  selectedBusId,
  onSelectBus,
  wsStatus = 'disconnected',
  onLocalEvent,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [localBusId, setLocalBusId] = useState<string>(buses[0]?.id ?? '');
  const [log, setLog] = useState<string>('Panel listo. Selecciona un bus y una accion.');
  const [isSending, setIsSending] = useState(false);

  const activeBusId = selectedBusId ?? localBusId;
  const currentBus = buses.find((b) => b.id === activeBusId) ?? buses[0];

  const handleSelectBus = (id: string) => {
    setLocalBusId(id);
    onSelectBus?.(id);
  };

  const handleInjectEvent = useCallback(
    async (eventType: SimEventType) => {
      if (!currentBus) {
        setLog('No hay bus seleccionado');
        return;
      }
      const meta = EVENT_META[eventType];
      setLog('Enviando: ' + meta.label + '...');
      setIsSending(true);
      try {
        const cap = currentBus.capacity;
        let pass = currentBus.currentPassengers;
        let boardings = currentBus.boardings ?? 0;
        let alightings = currentBus.alightings ?? 0;
        let studentBoardings = currentBus.studentBoardings ?? 0;

        if (meta.delta === 'board') {
          if (pass >= cap) { setLog('Bus ' + currentBus.id + ' esta lleno'); return; }
          pass = Math.min(cap, pass + 1);
          boardings += 1;
          if (eventType === 'tap_in_student') studentBoardings += 1;
        } else if (meta.delta === 'alight') {
          if (pass <= 0) { setLog('Bus ' + currentBus.id + ' ya esta vacio'); return; }
          pass = Math.max(0, pass - 1);
          alightings += 1;
        } else if (meta.delta === 'fill') {
          pass = cap;
        } else if (meta.delta === 'empty') {
          pass = 0;
        }

        // 1. Intentar via WebSocket nativo Go
        if (isConnected()) {
          const msg: PublishMessage = {
            type: 'publish',
            token: SIM_TOKEN,
            data: {
              busId: currentBus.id,
              routeId: currentBus.routeId,
              latitude: currentBus.latitude,
              longitude: currentBus.longitude,
              heading: currentBus.heading,
              speed: currentBus.speed,
              currentPassengers: pass,
              capacity: cap,
              boardings,
              alightings,
              studentBoardings,
            },
          };
          sendMessage(msg);
          setLog('WS -> ' + meta.label + ' | Bus ' + currentBus.id + ' | ' + pass + '/' + cap + ' pasajeros');
        } else {
          // 2. Fallback REST
          try {
            const res = await fetch('/api/v1/buses/simulate-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ busId: currentBus.id, eventType }),
            });
            if (res.ok) {
              setLog('REST -> ' + meta.label);
            } else {
              throw new Error('HTTP ' + res.status);
            }
          } catch {
            // 3. Fallback local
            onLocalEvent?.(currentBus.id, eventType);
            setLog('Local -> ' + meta.label + ' (sin conexion al servidor)');
          }
        }
      } finally {
        setIsSending(false);
      }
    },
    [currentBus, onLocalEvent],
  );

  if (!isOpen) {
    return (
      <button
        className="devtools-toggle-btn"
        onClick={() => setIsOpen(true)}
        title="Abrir Simulador"
        id="sim-devtools-toggle"
      >
        <FaTools />
        <span>DevTools</span>
      </button>
    );
  }

  const passengers = currentBus?.currentPassengers ?? 0;
  const capacity   = currentBus?.capacity ?? 35;
  const occupancy  = capacity > 0 ? Math.round((passengers / capacity) * 100) : 0;

  const occupancyColor =
    occupancy >= 95 ? '#ef4444'
    : occupancy >= 70 ? '#f59e0b'
    : '#22c55e';

  const occupancyLabel =
    occupancy >= 95 ? 'COMPLETO'
    : occupancy >= 70 ? 'Media-Alta'
    : 'Baja';

  const wsColor =
    wsStatus === 'connected'    ? '#22c55e'
    : wsStatus === 'connecting' ? '#f59e0b'
    : '#ef4444';

  const wsLabel =
    wsStatus === 'connected'    ? 'WS Activo'
    : wsStatus === 'connecting' ? 'Conectando...'
    : 'WS Inactivo - modo local';

  return (
    <div className="devtools-panel" id="sim-devtools-panel">
      <div className="devtools-header">
        <div className="devtools-title">
          <FaTools />
          <span>Inyector de Sensores y Pagos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: wsColor, fontWeight: 600 }}>
            <FaWifi size={10} />
            {wsLabel}
          </span>
          <button
            className="devtools-close-btn"
            onClick={() => setIsOpen(false)}
            title="Minimizar"
            id="sim-devtools-close"
          >
            <FaTimes size={16} />
          </button>
        </div>
      </div>

      <div className="devtools-body">
        {/* Selector de bus */}
        <div>
          <div className="devtools-section-title">Selecciona un Microbus</div>
          <div className="devtools-bus-tabs">
            {buses.slice(0, 4).map((bus) => (
              <button
                key={bus.id}
                className={'devtools-bus-tab' + (currentBus?.id === bus.id ? ' active' : '')}
                onClick={() => handleSelectBus(bus.id)}
                id={'sim-bus-tab-' + bus.id}
              >
                <span style={{ fontSize: '11px', fontWeight: 700 }}>
                  {(bus.routeName?.split('\u2014')[0]?.trim()) ?? bus.id}
                </span>
                <small style={{ fontSize: '10px', opacity: 0.8 }}>
                  {bus.currentPassengers}/{bus.capacity}
                </small>
              </button>
            ))}
          </div>
        </div>

        {/* Tarjeta de aforo */}
        <div className="devtools-aforo-card">
          <div className="devtools-aforo-row">
            <div>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>
                {currentBus?.routeName ?? currentBus?.id ?? '-'}
              </span>
              <span className="devtools-aforo-value">
                {passengers}
                <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>
                  {' '}/ {capacity}
                </span>
              </span>
            </div>
            <span
              className="devtools-aforo-badge"
              style={{ background: occupancyColor + '22', color: occupancyColor, border: '1px solid ' + occupancyColor + '55' }}
            >
              {occupancyLabel} ({occupancy}%)
            </span>
          </div>

          <div className="devtools-progress-bg">
            <div
              className="devtools-progress-bar"
              style={{
                width: Math.min(100, Math.max(0, occupancy)) + '%',
                background: 'linear-gradient(90deg, ' + occupancyColor + 'bb, ' + occupancyColor + ')',
                transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>

          <div className="devtools-counts-grid">
            <div className="count-item">
              <span className="count-title">Subidas</span>
              <span className="count-val">{currentBus?.boardings ?? 0}</span>
            </div>
            <div className="count-item">
              <span className="count-title">Escolares</span>
              <span className="count-val">{currentBus?.studentBoardings ?? 0}</span>
            </div>
            <div className="count-item">
              <span className="count-title">Bajadas</span>
              <span className="count-val">{currentBus?.alightings ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Inyectores */}
        <div>
          <div className="devtools-section-title">Inyectores Manuales de Eventos</div>
          <div className="devtools-actions-grid">
            <button className="devtools-action-btn btn-normal" onClick={() => handleInjectEvent('tap_in_normal')} disabled={passengers >= capacity || isSending} id="sim-btn-tap-normal">
              <FaCreditCard /><span>Bip Normal (+1)</span>
            </button>
            <button className="devtools-action-btn btn-student" onClick={() => handleInjectEvent('tap_in_student')} disabled={passengers >= capacity || isSending} id="sim-btn-tap-student">
              <FaUserGraduate /><span>Pase Escolar (+1)</span>
            </button>
            <button className="devtools-action-btn btn-alight" onClick={() => handleInjectEvent('sensor_alight')} disabled={passengers <= 0 || isSending} id="sim-btn-alight">
              <FaSignOutAlt /><span>Camara Bajada (-1)</span>
            </button>
            <button className="devtools-action-btn btn-fill" onClick={() => handleInjectEvent('fill_capacity')} disabled={isSending} id="sim-btn-fill">
              <FaBolt /><span>Llenar a {capacity}</span>
            </button>
            <button className="devtools-action-btn btn-empty" onClick={() => handleInjectEvent('empty_capacity')} disabled={isSending} id="sim-btn-empty">
              <FaTrash /><span>Vaciar Bus (0)</span>
            </button>
          </div>
        </div>

        {/* Log */}
        <div>
          <div className="devtools-section-title">Ultimo Evento</div>
          <div className="devtools-log-box" style={{ color: log.includes('Error') || log.includes('error') ? '#f87171' : log.includes('Local') ? '#fbbf24' : '#38bdf8' }}>
            {isSending ? <span style={{ opacity: 0.6 }}>Enviando...</span> : log}
          </div>
        </div>
      </div>
    </div>
  );
};
