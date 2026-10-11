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
	BusStatusActive       BusStatus = "ACTIVE"
	BusStatusInactive     BusStatus = "INACTIVE"
	BusStatusMaintenance  BusStatus = "MAINTENANCE"
	BusStatusOutOfService BusStatus = "OUT_OF_SERVICE"
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
	ComplaintCategoryFaresPayment     ComplaintCategory = "FARES_PAYMENT"
	ComplaintCategoryVehicleCondition ComplaintCategory = "VEHICLE_CONDITION"
	ComplaintCategoryAccessibility    ComplaintCategory = "ACCESSIBILITY"
	ComplaintCategoryOther            ComplaintCategory = "OTHER"
)

type FareType string

const (
	FareTypeBipayNormal      FareType = "BIPAY_NORMAL"       // Tarifa general ($700 CLP)
	FareTypeBipayEscolar     FareType = "BIPAY_ESCOLAR"      // Pase escolar TNE ($240 CLP)
	FareTypeBipayAdultoMayor FareType = "BIPAY_ADULTO_MAYOR" // Adulto mayor ($350 CLP)
)

// IsValid indica si la categoría corresponde a un valor del enum "ComplaintCategory".
func (c ComplaintCategory) IsValid() bool {
	switch c {
	case ComplaintCategoryDelay, ComplaintCategoryOvercrowding, ComplaintCategoryDriverBehavior,
		ComplaintCategoryFaresPayment, ComplaintCategoryVehicleCondition, ComplaintCategoryAccessibility, ComplaintCategoryOther:
		return true
	}
	return false
}

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
	Comment       string            `json:"comment,omitempty"`
	Category      ComplaintCategory `json:"category" db:"category"`
	Status        ComplaintStatus   `json:"status" db:"status"`
	Rating        *int              `json:"rating" db:"rating"`
	LineName      *string           `json:"lineName" db:"lineName"`
	AdminResponse *string           `json:"adminResponse" db:"adminResponse"`
	PassengerID   *string           `json:"passengerId" db:"passengerId"`
	UserID        *string           `json:"userId,omitempty"`
	BusID         *string           `json:"busId" db:"busId"`
	RouteID       *string           `json:"routeId" db:"routeId"`
	CompanyID     *string           `json:"companyId" db:"companyId"`
	TripID        *string           `json:"tripId" db:"tripId"`
	CreatedAt     time.Time         `json:"createdAt" db:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt" db:"updatedAt"`
}

// ComplaintStats representa el resumen analítico de reclamos para el dashboard administrativo.
type ComplaintStats struct {
	TotalComplaints    int            `json:"totalComplaints"`
	AverageRating      float64        `json:"averageRating"`
	CSAT               float64        `json:"csat"`
	ResolvedPercentage float64        `json:"resolvedPercentage"`
	PendingCount       int            `json:"pendingCount"`
	InReviewCount      int            `json:"inReviewCount"`
	ResolvedCount      int            `json:"resolvedCount"`
	RejectedCount      int            `json:"rejectedCount"`
	ByCategory         map[string]int `json:"byCategory"`
	ByLine             map[string]int `json:"byLine"`
	ByStatus           map[string]int `json:"byStatus"`
}

// RecaudoTransaction registra una validación y cobro de tarifa en microbuses (Bipay / Escolar / Adulto Mayor).
type RecaudoTransaction struct {
	ID        string    `json:"id" db:"id"`
	BusID     string    `json:"busId" db:"busId"`
	CardUID   string    `json:"cardUid" db:"cardUid"`
	FareType  FareType  `json:"fareType" db:"fareType"`
	Amount    int       `json:"amount" db:"amount"` // CLP
	Status    string    `json:"status" db:"status"` // APPROVED | REJECTED_AFORO_FULL
	RouteID   *string   `json:"routeId,omitempty" db:"routeId"`
	TripID    *string   `json:"tripId,omitempty" db:"tripId"`
	Latitude  *float64  `json:"latitude,omitempty" db:"latitude"`
	Longitude *float64  `json:"longitude,omitempty" db:"longitude"`
	CreatedAt time.Time `json:"createdAt" db:"createdAt"`
}

// ── Claims JWT ──────────────────────────────────────────────────────────────

// JWTClaims son los datos embebidos en el token JWT.
type JWTClaims struct {
	ID    string   `json:"id"`
	Email string   `json:"email"`
	Role  UserRole `json:"role"`
}
