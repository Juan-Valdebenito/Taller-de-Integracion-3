// ── Roles de usuario ───────────────────────────────────────
export enum UserRole {
  PASSENGER = 'PASSENGER',
  COMPANY = 'COMPANY',
  ADMIN = 'ADMIN',
}

// ── Estados de la micro ────────────────────────────────────
export enum BusStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

// ── Estados de reclamo ─────────────────────────────────────
export enum ComplaintStatus {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

// ── Tipos de pasaje ────────────────────────────────────────
export enum PassengerType {
  ADULT = 'ADULT',
  SCHOOL = 'SCHOOL',
}

// ── Nivel de ocupación ─────────────────────────────────────
export enum OccupancyLevel {
  LOW = 'LOW',       // < 40%
  MEDIUM = 'MEDIUM', // 40–70%
  HIGH = 'HIGH',     // 70–90%
  FULL = 'FULL',     // > 90%
}
