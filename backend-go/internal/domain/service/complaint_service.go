package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Errores del ciclo de vida y validación de reclamos
var (
	ErrInvalidStatus           = errors.New("estado de reclamo no válido")
	ErrInvalidStatusTransition = errors.New("transición de estado no permitida")
	ErrInvalidCategory         = errors.New("categoría de reclamo no válida")
	ErrInvalidRating           = errors.New("la calificación (rating) debe ser un entero entre 1 y 5")
	ErrMissingRequiredField    = errors.New("campo obligatorio faltante en el reclamo")
)

// AllowedComplaintStatuses contiene los estados válidos del sistema
var AllowedComplaintStatuses = map[domain.ComplaintStatus]bool{
	domain.ComplaintStatusPending:  true,
	domain.ComplaintStatusInReview: true,
	domain.ComplaintStatusResolved: true,
	domain.ComplaintStatusRejected: true,
}

// AllowedComplaintCategories contiene las categorías oficiales
var AllowedComplaintCategories = map[domain.ComplaintCategory]bool{
	domain.ComplaintCategoryDelay:            true,
	domain.ComplaintCategoryOvercrowding:     true,
	domain.ComplaintCategoryDriverBehavior:   true,
	domain.ComplaintCategoryFaresPayment:     true,
	domain.ComplaintCategoryVehicleCondition: true,
	domain.ComplaintCategoryAccessibility:    true,
	domain.ComplaintCategoryOther:            true,
}

// ValidStatusTransitions define el grafo de transiciones de estado permitidas
var ValidStatusTransitions = map[domain.ComplaintStatus]map[domain.ComplaintStatus]bool{
	domain.ComplaintStatusPending: {
		domain.ComplaintStatusPending:  true, // idempotente
		domain.ComplaintStatusInReview: true, // inicio de gestión
		domain.ComplaintStatusResolved: true, // resolución directa
		domain.ComplaintStatusRejected: true, // rechazo directo
	},
	domain.ComplaintStatusInReview: {
		domain.ComplaintStatusInReview: true, // actualización de respuesta en curso
		domain.ComplaintStatusResolved: true, // conclusión favorable
		domain.ComplaintStatusRejected: true, // conclusión denegada
		domain.ComplaintStatusPending:  true, // devolución a cola de espera si faltan antecedentes
	},
	domain.ComplaintStatusResolved: {
		domain.ComplaintStatusResolved: true, // actualización de resolución
		domain.ComplaintStatusInReview: true, // reapertura para revisión adicional
		// domain.ComplaintStatusRejected prohibido directamente sin pasar por IN_REVIEW
		// domain.ComplaintStatusPending prohibido directamente
	},
	domain.ComplaintStatusRejected: {
		domain.ComplaintStatusRejected: true, // actualización de motivo de rechazo
		domain.ComplaintStatusInReview: true, // reapertura tras apelación
		// domain.ComplaintStatusResolved prohibido directamente sin pasar por IN_REVIEW
		// domain.ComplaintStatusPending prohibido directamente
	},
}

// ComplaintService gestiona las reglas de negocio, transiciones y validaciones del dominio de reclamos.
type ComplaintService struct{}

func NewComplaintService() *ComplaintService {
	return &ComplaintService{}
}

// IsValidStatus verifica si el estado pertenece a los estados permitidos
func (s *ComplaintService) IsValidStatus(status domain.ComplaintStatus) bool {
	return AllowedComplaintStatuses[status]
}

// IsValidCategory verifica si la categoría pertenece a las categorías oficiales
func (s *ComplaintService) IsValidCategory(cat domain.ComplaintCategory) bool {
	return AllowedComplaintCategories[cat]
}

// IsValidRating valida que el rating esté en el rango [1, 5] si fue provisto
func (s *ComplaintService) IsValidRating(rating *int) bool {
	if rating == nil {
		return true
	}
	return *rating >= 1 && *rating <= 5
}

// ValidateTransition evalúa si la transición entre el estado actual y el nuevo estado es legal
func (s *ComplaintService) ValidateTransition(current, next domain.ComplaintStatus) error {
	if !s.IsValidStatus(current) {
		return fmt.Errorf("%w: estado actual '%s'", ErrInvalidStatus, current)
	}
	if !s.IsValidStatus(next) {
		return fmt.Errorf("%w: estado destino '%s'", ErrInvalidStatus, next)
	}

	allowedNext, exists := ValidStatusTransitions[current]
	if !exists || !allowedNext[next] {
		return fmt.Errorf("%w: no se permite cambiar de '%s' a '%s'", ErrInvalidStatusTransition, current, next)
	}

	return nil
}

// ValidateNewComplaint valida los campos esenciales al crear un nuevo reclamo
func (s *ComplaintService) ValidateNewComplaint(category domain.ComplaintCategory, rating *int, lineName string) error {
	if !s.IsValidCategory(category) {
		return fmt.Errorf("%w: '%s'", ErrInvalidCategory, category)
	}
	if !s.IsValidRating(rating) {
		return ErrInvalidRating
	}
	if strings.TrimSpace(lineName) == "" {
		return fmt.Errorf("%w: lineName es obligatorio", ErrMissingRequiredField)
	}
	return nil
}
