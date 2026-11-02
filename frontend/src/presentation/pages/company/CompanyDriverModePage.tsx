import { useEffect, useMemo, useState } from 'react';
import {
  FaBus,
  FaCheckCircle,
  FaClock,
  FaMapMarkerAlt,
  FaPlay,
  FaRoute,
  FaStop,
  FaUsers,
  FaWifi,
} from 'react-icons/fa';
import './CompanyDriverModePage.css';

interface DriverBus {
  id: string;
  plate: string;
  capacity: number;
  passengers: number;
  status: 'Disponible' | 'En servicio' | 'Mantenimiento';
}

interface DriverRoute {
  id: string;
  code: string;
  name: string;
  stops: string[];
  duration: string;
}

const BUSES: DriverBus[] = [
  { id: 'bus-7a-01', plate: 'BGPK-45', capacity: 35, passengers: 14, status: 'Disponible' },
  { id: 'bus-7a-02', plate: 'CRTM-12', capacity: 35, passengers: 28, status: 'En servicio' },
  { id: 'bus-1c-01', plate: 'DKSL-90', capacity: 35, passengers: 8, status: 'Disponible' },
  { id: 'bus-res-01', plate: 'FGRT-33', capacity: 35, passengers: 0, status: 'Mantenimiento' },
];

const ROUTES: DriverRoute[] = [
  {
    id: 'route-7a',
    code: '7A',
    name: 'Cajón / Santa Rosa',
    stops: ['Terminal Cajón', 'Av. Alemania', 'Centro', 'Santa Rosa'],
    duration: '45 min',
  },
  {
    id: 'route-7b',
    code: '7B',
    name: 'San Antonio / Amanecer',
    stops: ['San Antonio', 'Hospital', 'Centro', 'Amanecer'],
    duration: '38 min',
  },
  {
    id: 'route-1c',
    code: '1C',
    name: 'Labranza / Centro',
    stops: ['Labranza', 'Padre Las Casas', 'Centro', 'Av. Caupolicán'],
    duration: '52 min',
  },
];

export function CompanyDriverModePage() {
  const [selectedBusId, setSelectedBusId] = useState(BUSES[0].id);
  const [selectedRouteId, setSelectedRouteId] = useState(ROUTES[0].id);
  const [isTripActive, setIsTripActive] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const selectedBus = useMemo(
    () => BUSES.find((bus) => bus.id === selectedBusId) ?? BUSES[0],
    [selectedBusId],
  );
  const selectedRoute = useMemo(
    () => ROUTES.find((route) => route.id === selectedRouteId) ?? ROUTES[0],
    [selectedRouteId],
  );
  const progress = Math.min(
    100,
    Math.round((elapsedMinutes / Math.max(Number.parseInt(selectedRoute.duration, 10), 1)) * 100),
  );
  const nextStopIndex = Math.min(
    selectedRoute.stops.length - 1,
    Math.floor(progress / (100 / selectedRoute.stops.length)),
  );

  useEffect(() => {
    if (!isTripActive) return undefined;
    const timer = window.setInterval(() => {
      setElapsedMinutes((minutes) => minutes + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [isTripActive]);

  const handleStartTrip = () => {
    setElapsedMinutes(0);
    setIsTripActive(true);
  };

  const handleStopTrip = () => {
    setIsTripActive(false);
  };

  return (
    <div className="driver-mode">
      <header className="driver-mode__header">
        <div>
          <p className="driver-mode__eyebrow">Operación en terreno</p>
          <h1>Modo conductor</h1>
          <p className="driver-mode__subtitle">Controla tu unidad y mantén informada la ruta.</p>
        </div>
        <span className="driver-mode__connection">
          <FaWifi aria-hidden="true" /> Conectado
        </span>
      </header>

      {!isTripActive ? (
        <section className="driver-card driver-card--setup" aria-labelledby="setup-title">
          <div className="driver-card__title">
            <div className="driver-card__icon"><FaBus aria-hidden="true" /></div>
            <div>
              <h2 id="setup-title">Preparar recorrido</h2>
              <p>Selecciona la unidad y el servicio que realizarás.</p>
            </div>
          </div>

          <label className="driver-field" htmlFor="driver-bus">
            <span>Unidad asignada</span>
            <select id="driver-bus" value={selectedBusId} onChange={(event) => setSelectedBusId(event.target.value)}>
              {BUSES.map((bus) => (
                <option key={bus.id} value={bus.id} disabled={bus.status === 'Mantenimiento'}>
                  {bus.plate} · {bus.status}
                </option>
              ))}
            </select>
          </label>

          <label className="driver-field" htmlFor="driver-route">
            <span>Recorrido</span>
            <select id="driver-route" value={selectedRouteId} onChange={(event) => setSelectedRouteId(event.target.value)}>
              {ROUTES.map((route) => (
                <option key={route.id} value={route.id}>
                  Línea {route.code} · {route.name}
                </option>
              ))}
            </select>
          </label>

          <div className="driver-summary">
            <span><FaUsers aria-hidden="true" /> {selectedBus.passengers}/{selectedBus.capacity} pasajeros</span>
            <span><FaClock aria-hidden="true" /> {selectedRoute.duration}</span>
          </div>

          <button
            className="driver-primary-action"
            type="button"
            onClick={handleStartTrip}
            disabled={selectedBus.status === 'Mantenimiento'}
          >
            <FaPlay aria-hidden="true" /> Iniciar recorrido
          </button>
        </section>
      ) : (
        <section className="driver-card driver-card--active" aria-labelledby="active-trip-title">
          <div className="driver-live-heading">
            <div>
              <span className="driver-live-badge"><span /> En recorrido</span>
              <h2 id="active-trip-title">Línea {selectedRoute.code}</h2>
              <p>{selectedRoute.name} · Unidad {selectedBus.plate}</p>
            </div>
            <button className="driver-stop-action" type="button" onClick={handleStopTrip}>
              <FaStop aria-hidden="true" /> Finalizar
            </button>
          </div>

          <div className="driver-progress" aria-label={`Progreso del recorrido: ${progress}%`}>
            <div className="driver-progress__labels">
              <span>Inicio del recorrido</span><strong>{progress}%</strong>
            </div>
            <div className="driver-progress__track"><span style={{ width: `${progress}%` }} /></div>
            <div className="driver-progress__stops">
              {selectedRoute.stops.map((stop, index) => (
                <span key={stop} className={index <= nextStopIndex ? 'is-passed' : ''}>{stop}</span>
              ))}
            </div>
          </div>

          <div className="driver-next-stop">
            <div className="driver-next-stop__icon"><FaMapMarkerAlt aria-hidden="true" /></div>
            <div>
              <span>Próxima parada</span>
              <strong>{selectedRoute.stops[nextStopIndex]}</strong>
            </div>
            <FaCheckCircle className="driver-next-stop__check" aria-label="Ruta activa" />
          </div>

          <div className="driver-stats">
            <div><FaUsers aria-hidden="true" /><strong>{selectedBus.passengers}</strong><span>Pasajeros</span></div>
            <div><FaClock aria-hidden="true" /><strong>{elapsedMinutes} min</strong><span>Transcurrido</span></div>
            <div><FaRoute aria-hidden="true" /><strong>{selectedRoute.stops.length}</strong><span>Paradas</span></div>
          </div>
        </section>
      )}

      <p className="driver-mode__hint">
        <FaCheckCircle aria-hidden="true" /> La ubicación se actualizará automáticamente mientras el recorrido esté activo.
      </p>
    </div>
  );
}
