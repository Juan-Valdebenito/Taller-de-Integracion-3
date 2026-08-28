package domain

import "time"

// ── Enums ──────────────────────────────────────────────────────────────────

type UserRole string

const (
	UserRolePassenger UserRole = "PASSENGER"
	UserRoleCompany   UserRole = "COMPANY"
	UserRoleAdmin     UserRole = "ADMIN"
)

type BusStatus string

const (
	BusStatusActive      BusStatus = "ACTIVE"
	BusStatusInactive    BusStatus = "INACTIVE"
	BusStatusMaintenance BusStatus = "MAINTENANCE"
)

type ComplaintStatus string

const (
	ComplaintStatusPending   ComplaintStatus = "PENDING"
	ComplaintStatusInReview  ComplaintStatus = "IN_REVIEW"
	ComplaintStatusResolved  ComplaintStatus = "RESOLVED"
	ComplaintStatusRejected  ComplaintStatus = "REJECTED"
)

type ComplaintCategory string

const (
	ComplaintCategoryDelay            ComplaintCategory = "DELAY"
	ComplaintCategoryOvercrowding     ComplaintCategory = "OVERCROWDING"
	ComplaintCategoryDriverBehavior   ComplaintCategory = "DRIVER_BEHAVIOR"
	ComplaintCategoryVehicleCondition ComplaintCategory = "VEHICLE_CONDITION"
	ComplaintCategoryAccessibility    ComplaintCategory = "ACCESSIBILITY"
	ComplaintCategoryOther            ComplaintCategory = "OTHER"
)

// ── Modelos ────────────────────────────────────────────────────────────────

// User representa a un pasajero, operador de empresa o administrador.
type User struct {
	ID           string    `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"passwordHash"`
	Role         UserRole  `json:"role" db:"role"`
	IsActive     bool      `json:"isActive" db:"isActive"`
	CompanyID    *string   `json:"companyId" db:"companyId"`
	CreatedAt    time.Time `json:"createdAt" db:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updatedAt"`
}

// Bus representa un vehículo de transporte público.
type Bus struct {
	ID                string    `json:"id" db:"id"`
	Patente           string    `json:"patente" db:"patente"`
	Capacity          int       `json:"capacity" db:"capacity"`
	CurrentPassengers int       `json:"currentPassengers" db:"currentPassengers"`
	Boardings         int       `json:"boardings" db:"boardings"`
	Alightings        int       `json:"alightings" db:"alightings"`
	SchoolBoardings   int       `json:"schoolBoardings" db:"schoolBoardings"`
	Status            BusStatus `json:"status" db:"status"`
	LastLatitude      *float64  `json:"lastLatitude" db:"lastLatitude"`
	LastLongitude     *float64  `json:"lastLongitude" db:"lastLongitude"`
	LastHeading       *float64  `json:"lastHeading" db:"lastHeading"`
	LastSpeed         *float64  `json:"lastSpeed" db:"lastSpeed"`
	LastLocationAt    *time.Time `json:"lastLocationAt" db:"lastLocationAt"`
	CompanyID         string    `json:"companyId" db:"companyId"`
	RouteID           *string   `json:"routeId" db:"routeId"`
	CreatedAt         time.Time `json:"createdAt" db:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt" db:"updatedAt"`
}

// Stop representa una parada dentro de una ruta.
type Stop struct {
	ID        string  `json:"id" db:"id"`
	Name      string  `json:"name" db:"name"`
	Latitude  float64 `json:"latitude" db:"latitude"`
	Longitude float64 `json:"longitude" db:"longitude"`
	Order     int     `json:"order" db:"order"`
	RouteID   string  `json:"routeId" db:"routeId"`
}

// Route representa una línea de transporte público.
type Route struct {
	ID          string    `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Code        string    `json:"code" db:"code"`
	Description *string   `json:"description" db:"description"`
	IsActive    bool      `json:"isActive" db:"isActive"`
	CompanyID   string    `json:"companyId" db:"companyId"`
	CreatedAt   time.Time `json:"createdAt" db:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updatedAt"`
}

// Complaint representa un reclamo enviado por un pasajero.
type Complaint struct {
	ID            string            `json:"id" db:"id"`
	Title         string            `json:"title" db:"title"`
	Description   string            `json:"description" db:"description"`
	Category      ComplaintCategory `json:"category" db:"category"`
	Status        ComplaintStatus   `json:"status" db:"status"`
	AdminResponse *string           `json:"adminResponse" db:"adminResponse"`
	PassengerID   string            `json:"passengerId" db:"passengerId"`
	BusID         *string           `json:"busId" db:"busId"`
	RouteID       *string           `json:"routeId" db:"routeId"`
	CompanyID     string            `json:"companyId" db:"companyId"`
	TripID        *string           `json:"tripId" db:"tripId"`
	CreatedAt     time.Time         `json:"createdAt" db:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt" db:"updatedAt"`
}

// ── Claims JWT ──────────────────────────────────────────────────────────────

// JWTClaims son los datos embebidos en el token JWT.
type JWTClaims struct {
	ID    string   `json:"id"`
	Email string   `json:"email"`
	Role  UserRole `json:"role"`
}
