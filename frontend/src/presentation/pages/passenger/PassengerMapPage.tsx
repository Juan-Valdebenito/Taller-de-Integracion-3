import { useState, useEffect } from 'react';
import axios from 'axios';
import { ComplaintModal } from '../../components/passenger/ComplaintModal';
import { LiveMap, BusData, HazardData } from '../../components/passenger/LiveMap';
import { HazardModal } from '../../components/passenger/HazardModal';
import { SimulationDevTools } from '../../components/passenger/SimulationDevTools';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export function PassengerMapPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState({ busId: 'B-7A-01', lineName: '7A' });
  const [buses, setBuses] = useState<BusData[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [hazards, setHazards] = useState<HazardData[]>([]);
  const [isHazardModalOpen, setIsHazardModalOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Carga inicial inmediata vía REST para que aparezcan de inmediato en el mapa
    axios.get(`${SOCKET_URL}/api/v1/buses`)
      .then((res) => {
        if (res.data?.data && Array.isArray(res.data.data)) {
          setBuses(res.data.data);
        }
      })
      .catch((err) => console.warn('Carga inicial REST:', err.message));

    // Conectar a Socket.io
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
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

    // Escuchar actualizaciones de ubicación y estado de aforo en tiempo real
    socketInstance.on('bus:location:broadcast', updateBusState);
    socketInstance.on('bus:status:broadcast', updateBusState);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

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
      <SimulationDevTools
        socket={socket}
        buses={buses as any}
        selectedBusId={selectedBus.busId}
        onSelectBus={(busId) => {
          const found = buses.find((b) => b.id === busId);
          if (found) {
            setSelectedBus({ busId: found.id, lineName: found.line });
          }
        }}
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
