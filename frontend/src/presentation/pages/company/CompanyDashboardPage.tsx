/** Dashboard principal de empresa - Por implementar */
export function CompanyDashboardPage() {
  return (
    <div>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Dashboard
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)' }}>
        🚧 KPIs y resumen de operaciones de la empresa
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        {[
          { icon: '🚍', label: 'Micros activas', value: '—' },
          { icon: '🗺️', label: 'Rutas en servicio', value: '—' },
          { icon: '👥', label: 'Pasajeros hoy', value: '—' },
          { icon: '📋', label: 'Reclamos pendientes', value: '—' },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '2rem' }}>{icon}</span>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>{label}</p>
            <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
