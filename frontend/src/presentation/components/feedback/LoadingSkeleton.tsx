interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`loading-skeleton ${className}`} role="status" aria-label="Cargando">
      {Array.from({ length: lines }, (_, index) => (
        <div
          className="loading-skeleton-line"
          key={index}
          style={{ width: index === lines - 1 ? '68%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function BusListSkeleton() {
  return (
    <div className="bus-list-skeleton" role="status" aria-label="Cargando micros">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="bus-list-skeleton-row" key={index}>
          <div className="loading-skeleton-circle" />
          <div className="bus-list-skeleton-content">
            <LoadingSkeleton lines={2} />
            <div className="loading-skeleton-bar" />
          </div>
        </div>
      ))}
    </div>
  );
}
