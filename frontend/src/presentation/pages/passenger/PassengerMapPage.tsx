import { useState, useEffect } from 'react';
import { ComplaintModal } from '../../components/passenger/ComplaintModal';
import { LiveMap, BusData } from '../../components/passenger/LiveMap';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export function PassengerMapPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState({ busId: '', lineName: '' });
  const [buses, setBuses] = useState<BusData[]>([]);

  useEffect(() => {
    // Conectar a Socket.io
    const socket = io(SOCKET_URL);

    // Escuchar actualizaciones de ubicación en tiempo real
    socket.on('bus:location:broadcast', (data: BusData) => {
      setBuses((prevBuses) => {
        const existingBusIndex = prevBuses.findIndex(b => b.id === data.id);
        if (existingBusIndex >= 0) {
          // Actualizar ubicación de micro existente
          const newBuses = [...prevBuses];
          newBuses[existingBusIndex] = data;
          return newBuses;
        } else {
          // Agregar nueva micro al mapa
          return [...prevBuses, data];
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleBusClick = (busId: string, lineName: string) => {
    setSelectedBus({ busId, lineName });
    setIsModalOpen(true);
  };

  return (
    <div style={{
      height: 'calc(100vh - 65px)',
      width: '100%',
      position: 'relative',
      padding: 'var(--space-4)',
      boxSizing: 'border-box'
    }}>
      {/* Mapa Interactivo */}
      <LiveMap buses={buses} onBusClick={handleBusClick} />

      {/* Modal de Reclamo */}
      <ComplaintModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        busId={selectedBus.busId}
        lineName={selectedBus.lineName}
      />
    </div>
  );
}
