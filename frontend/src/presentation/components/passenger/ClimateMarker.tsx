import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { ClimateTelemetryRecord } from '../../../infrastructure/api/climateTelemetryApi';

interface ClimateMarkerProps {
  record: ClimateTelemetryRecord;
}

type ClimateLevel = 'normal' | 'warning' | 'critical';

const getClimateLevel = (record: ClimateTelemetryRecord): ClimateLevel => {
  const status = record.status.trim().toUpperCase();
  const hasCriticalStatus = /CRITICAL|ERROR|OFFLINE|UNAVAILABLE/.test(status);
  const hasUnknownStatus = !['OPERATIONAL', 'ACTIVE', 'OK', 'NORMAL'].includes(status);
  const hasCriticalReading =
    record.temperature_c >= 40 || record.temperature_c <= -5 ||
    record.humidity_pct >= 95 || record.humidity_pct <= 10 ||
    record.pm25_ug_m3 >= 55.5 || record.pm10_ug_m3 >= 150;

  if (hasCriticalReading) {
    const criticalParams: string[] = [];
    if (record.temperature_c >= 40 || record.temperature_c <= -5) criticalParams.push('Temperatura');
    if (record.humidity_pct >= 95 || record.humidity_pct <= 10) criticalParams.push('Humedad');
    if (record.pm25_ug_m3 >= 55.5) criticalParams.push('PM2.5');
    if (record.pm10_ug_m3 >= 150) criticalParams.push('PM10');

    console.warn(`Estación ${record.station_id} tiene lecturas críticas: ${criticalParams.join(', ')}`);
  }
  if (hasCriticalStatus || hasCriticalReading) return 'critical';

  const hasWarningReading =
    record.temperature_c >= 30 || record.temperature_c <= 0 ||
    record.humidity_pct >= 85 || record.humidity_pct <= 20 ||
    record.wind_speed_kmh >= 60 || record.pm25_ug_m3 >= 12.1 || record.pm10_ug_m3 >= 54;

  return hasUnknownStatus || hasWarningReading ? 'warning' : 'normal';
};

const getClimateSymbol = (record: ClimateTelemetryRecord, level: ClimateLevel): string => {
  if (level === 'critical') return '!';
  if (record.temperature_c >= 30) return '\u2668';
  if (record.temperature_c <= 0) return '\u2744';
  if (record.humidity_pct >= 75) return '\u25cf';
  if (record.pm25_ug_m3 >= 12.1 || record.pm10_ug_m3 >= 54) return '\u224b';
  return '\u2600';
};

const levelStyles: Record<ClimateLevel, { color: string; label: string }> = {
  normal: { color: '#16a34a', label: 'Normal' },
  warning: { color: '#d97706', label: 'Precaución' },
  critical: { color: '#dc2626', label: 'Crítico' },
};

export function ClimateMarker({ record }: ClimateMarkerProps) {
  const level = getClimateLevel(record);
  const { color, label } = levelStyles[level];
  const symbol = getClimateSymbol(record, level);
  const icon = new L.DivIcon({
    className: 'climate-marker-container',
    html: `<span class="climate-marker-icon" style="--climate-color:${color}">${symbol}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

  return (
    <Marker
      position={[record.latitude, record.longitude]}
      icon={icon}
      bubblingMouseEvents={false}
    >
      <Popup>
        <div className="climate-popup">
          <strong>Estación {record.station_id}</strong>
          <span className={`climate-popup-level is-${level}`}>{label}</span>
          <span>{record.sector}</span>
          <time dateTime={record.time}>{new Date(record.time).toLocaleString()}</time>
          <dl>
            <div><dt>Temperatura</dt><dd>{record.temperature_c.toFixed(1)} °C</dd></div>
            <div><dt>Humedad</dt><dd>{record.humidity_pct.toFixed(1)} %</dd></div>
            <div><dt>Viento</dt><dd>{record.wind_speed_kmh.toFixed(1)} km/h</dd></div>
            <div><dt>PM2.5</dt><dd>{record.pm25_ug_m3.toFixed(1)} µg/m³</dd></div>
            <div><dt>PM10</dt><dd>{record.pm10_ug_m3.toFixed(1)} µg/m³</dd></div>
            <div><dt>Estado</dt><dd>{record.status}</dd></div>
          </dl>
        </div>
      </Popup>
    </Marker>
  );
}
