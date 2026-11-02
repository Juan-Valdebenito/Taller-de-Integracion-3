import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { MicroStop } from '../../../infrastructure/api/microStopsApi';

interface StopMarkerProps {
  stop: MicroStop;
}

const stopIcon = new L.DivIcon({
  className: 'stop-marker-container',
  html: '<span class="stop-marker-icon" aria-hidden="true">●</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

export function StopMarker({ stop }: StopMarkerProps) {
  return (
    <Marker
      position={[stop.latitude, stop.longitude]}
      icon={stopIcon}
      bubblingMouseEvents={false}
    >
      <Popup>
        <div className="stop-popup">
          <strong>{stop.name}</strong>
          <dl>
            <div>
              <dt>ID</dt>
              <dd>{stop.id}</dd>
            </div>
            <div>
              <dt>Coordenadas</dt>
              <dd>{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</dd>
            </div>
          </dl>
        </div>
      </Popup>
    </Marker>
  );
}