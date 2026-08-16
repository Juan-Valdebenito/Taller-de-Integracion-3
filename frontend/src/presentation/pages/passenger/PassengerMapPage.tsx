/** Vista del mapa en tiempo real para pasajeros - Por implementar */
export function PassengerMapPage() {
  return (
    <div style={{
      height: 'calc(100vh - 65px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-surface-2)',
      flexDirection: 'column',
      gap: 'var(--space-4)',
    }}>
      <span style={{ fontSize: '4rem' }}>🗺️</span>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>
        Mapa en tiempo real
      </h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        🚧 Aquí irá el mapa interactivo con las micros en tiempo real
      </p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
        Integrar: Leaflet / Google Maps + Socket.io
      </p>
    </div>
  );
}
