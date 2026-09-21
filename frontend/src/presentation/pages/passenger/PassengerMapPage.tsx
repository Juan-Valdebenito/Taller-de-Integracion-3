import { useState, useEffect } from 'react';
import axios from 'axios';
import { ComplaintModal } from '../../components/passenger/ComplaintModal';
import { LiveMap, BusData, HazardData } from '../../components/passenger/LiveMap';
import { HazardModal } from '../../components/passenger/HazardModal';
import { DevToolsSimulationPanel } from '../../components/passenger/DevToolsSimulationPanel';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

// Micros iniciales en Temuco para garantizar visualización inmediata
const INITIAL_BUSES: BusData[] = [
  {
    id: 'B-7A-01',
    line: '7A',
    lat: -38.7359 + 0.004,
    lng: -72.5904 + 0.005,
    status: 'En ruta',
    capacity: 35,
    currentPassengers: 14,
    boardings: 18,
    schoolBoardings: 6,
    alightings: 4,
    occupancyPercentage: 40,
    isFull: false,
    lastEvent: {
      type: 'tap_in_normal',
      description: 'Pasajero ingresó (Pago estándar $700 CLP)',
      timestamp: new Date().toLocaleTimeString(),
    },
  },
  {
    id: 'B-7A-02',
    line: '7A',
    lat: -38.7359 - 0.004,
    lng: -72.5904 + 0.003,
    status: 'En ruta',
    capacity: 35,
    currentPassengers: 28,
    boardings: 32,
    schoolBoardings: 10,
    alightings: 4,
    occupancyPercentage: 80,
    isFull: false,
  },
  {
    id: 'B-7B-01',
    line: '7B',
    lat: -38.7359 + 0.002,
    lng: -72.5904 - 0.006,
    status: 'En ruta',
    capacity: 35,
    currentPassengers: 35,
    boardings: 40,
    schoolBoardings: 8,
    alightings: 5,
    occupancyPercentage: 100,
    isFull: true,
  },
  {
    id: 'B-1C-01',
    line: '1C',
    lat: -38.7359 - 0.006,
    lng: -72.5904 - 0.003,
    status: 'En ruta',
    capacity: 35,
    currentPassengers: 8,
    boardings: 12,
    schoolBoardings: 3,
    alightings: 4,
    occupancyPercentage: 23,
    isFull: false,
  },
];

export function PassengerMapPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState({ busId: 'B-7A-01', lineName: '7A' });
  const [buses, setBuses] = useState<BusData[]>(INITIAL_BUSES);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [hazards, setHazards] = useState<HazardData[]>([]);
  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Carga inicial vía REST (compatible con Go y Node)
    axios.get(`${SOCKET_URL}/api/v1/buses`)
      .then((res) => {
        const rawList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const mapped: BusData[] = rawList.map((raw: any, index: number) => {
            const def = INITIAL_BUSES[index % INITIAL_BUSES.length];
            let line = raw.line || raw.routeCode;
            if (!line && raw.routeId) {
              line = raw.routeId.replace('route-', '').toUpperCase();
            }
            line = line || def.line;

            const lat = (typeof raw.lat === 'number' && !isNaN(raw.lat)) 
              ? raw.lat 
              : (raw.lastLatitude || def.lat);
            const lng = (typeof raw.lng === 'number' && !isNaN(raw.lng)) 
              ? raw.lng 
              : (raw.lastLongitude || def.lng);
            const capacity = raw.capacity || 35;
            const currentPassengers = raw.currentPassengers ?? def.currentPassengers;
            const occupancyPercentage = Math.round((currentPassengers / capacity) * 100);

            return {
              id: raw.id || def.id,
              line,
              lat,
              lng,
              status: raw.status || 'En ruta',
              capacity,
              currentPassengers,
              occupancyPercentage,
              boardings: raw.boardings ?? def.boardings,
              schoolBoardings: raw.schoolBoardings ?? def.schoolBoardings,
              alightings: raw.alightings ?? def.alightings,
              isFull: currentPassengers >= capacity,
              lastEvent: raw.lastEvent || def.lastEvent,
            };
          });
          setBuses(mapped);
        }
      })
      .catch((err) => console.warn('Carga inicial REST:', err.message));

    // Conectar a Socket.io si está disponible
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 2,
      timeout: 3000,
    });
    setSocket(socketInstance);

    const updateBusState = (data: BusData) => {
      setBuses((prevBuses) => {
        const existingBusIndex = prevBuses.findIndex((b) => b.id === data.id);
        if (existingBusIndex >= 0) {
          const updated = [...prevBuses];
          updated[existingBusIndex] = {
            ...updated[existingBusIndex],
            ...data,
          };
          return updated;
        } else {
          return [...prevBuses, data];
        }
      });
    };

    socketInstance.on('bus:location:broadcast', updateBusState);
    socketInstance.on('bus:status:broadcast', updateBusState);

    // Simulación de movimiento local suave si el backend no tiene WebSockets (ej: Go)
    const movementInterval = setInterval(() => {
      if (socketInstance.connected) return;
      setBuses((prev) =>
        prev.map((bus, idx) => {
          const angle = (Date.now() / 4000) + (idx * (Math.PI / 2));
          const deltaLat = Math.sin(angle) * 0.00015;
          const deltaLng = Math.cos(angle) * 0.00015;
          return {
            ...bus,
            lat: bus.lat + deltaLat,
            lng: bus.lng + deltaLng,
          };
        })
      );
    }, 2000);

    return () => {
      clearInterval(movementInterval);
      socketInstance.disconnect();
    };
  }, []);

  // Manejador reactivo para los botones de DevTools (subir/bajar pasajero, aforo)
  const handleLocalSimulationEvent = (busId: string, eventType: string) => {
    setBuses((prev) =>
      prev.map((b) => {
        if (b.id !== busId) return b;
        let pass = b.currentPassengers ?? 0;
        let boardings = b.boardings ?? 0;
        let school = b.schoolBoardings ?? 0;
        let alight = b.alightings ?? 0;
        let desc = '';

        if (eventType === 'tap_in_normal') {
          pass = Math.min(b.capacity || 35, pass + 1);
          boardings += 1;
          desc = 'Pasajero ingresó (Tarjeta Normal +$700)';
        } else if (eventType === 'tap_in_student') {
          pass = Math.min(b.capacity || 35, pass + 1);
          boardings += 1;
          school += 1;
          desc = 'Estudiante ingresó (TNE +$240)';
        } else if (eventType === 'sensor_alight') {
          pass = Math.max(0, pass - 1);
          alight += 1;
          desc = 'Pasajero descendió por puerta trasera (-1)';
        } else if (eventType === 'fill_max' || eventType === 'fill_capacity') {
          pass = b.capacity || 35;
          desc = 'Micro completó su capacidad máxima (35)';
        } else if (eventType === 'reset_empty' || eventType === 'empty_capacity') {
          pass = 0;
          desc = 'Microbús vaciado (0 pasajeros)';
        }

        const cap = b.capacity || 35;
        const occ = Math.round((pass / cap) * 100);
        return {
          ...b,
          currentPassengers: pass,
          boardings,
          schoolBoardings: school,
          alightings: alight,
          occupancyPercentage: occ,
          isFull: pass >= cap,
          lastEvent: {
            type: eventType,
            description: desc,
            timestamp: new Date().toLocaleTimeString(),
          },
        };
      })
    );
  };

  const handleBusClick = (busId: string, lineName: string) => {
    setSelectedBus({ busId, lineName });
    setIsModalOpen(true);
  };

  const handleMapClick = (lat: number, lng: number) => {
    setPendingLocation({ lat, lng });
    setIsHazardModalOpen(true);
  };

  const handleCreateHazard = (title: string, description: string) => {
    if (!pendingLocation) return;
    const hazard: HazardData = {
      id: crypto.randomUUID(),
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      title,
      description,
      createdAt: new Date().toISOString(),
      usefulVotes: 0,
    };
    setHazards((prev) => [...prev, hazard]);
    setPendingLocation(null);
  };

  // Registra un voto "Útil" (solo una vez por usuario vía localStorage).
  // Devuelve true si el voto fue contado.
  const handleHazardUseful = (id: string): boolean => {
    const votedIds = JSON.parse(localStorage.getItem('hazard:voted') ?? '[]') as string[];
    if (votedIds.includes(id)) return false;

    localStorage.setItem('hazard:voted', JSON.stringify([...votedIds, id]));
    setHazards((prev) =>
      prev.map((h) => (h.id === id ? { ...h, usefulVotes: h.usefulVotes + 1 } : h)),
    );
    return true;
  };

  const handleHazardResolve = (id: string) => {
    setHazards((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <div style={{
      height: 'calc(100vh - 65px)',
      width: '100%',
      position: 'relative',
      padding: 'var(--space-4)',
      boxSizing: 'border-box'
    }}>
      {/* Mapa Interactivo con Aforo Dinámico */}
      <LiveMap 
        buses={buses} 
        hazards={hazards}
        onBusClick={handleBusClick} 
        onMapClick={handleMapClick}
        onHazardUseful={handleHazardUseful}
        onHazardResolve={handleHazardResolve}
        selectedBusId={selectedBus.busId}
      />

      {/* Panel Flotante DevTools para Simulación de Sensores y Pagos (Líneas 7A, 7B, 1C) */}
      <DevToolsSimulationPanel
        socket={socket}
        buses={buses as any}
        selectedBusId={selectedBus.busId}
        onSelectBus={(busId) => {
          const found = buses.find((b) => b.id === busId);
          if (found) {
            setSelectedBus({ busId: found.id, lineName: found.line });
          }
        }}
        onLocalEvent={handleLocalSimulationEvent as any}
      />

      {/* Modal Flotante Contextual de Reclamo */}
      <ComplaintModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        busId={selectedBus.busId}
        lineName={selectedBus.lineName}
      />

      {/* Modal de Reporte de Peligro */}
      <HazardModal
        isOpen={isHazardModalOpen}
        lat={pendingLocation?.lat ?? 0}
        lng={pendingLocation?.lng ?? 0}
        onClose={() => {
          setIsHazardModalOpen(false);
          setPendingLocation(null);
        }}
        onCreate={handleCreateHazard}
      />
    </div>
  );
}
