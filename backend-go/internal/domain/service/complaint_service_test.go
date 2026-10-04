package service_test

import (
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

func TestComplaintService_ValidateTransition_ValidTransitions(t *testing.T) {
	svc := service.NewComplaintService()

	tests := []struct {
		name    string
		current domain.ComplaintStatus
		next    domain.ComplaintStatus
	}{
		// PENDING -> transitions
		{"PENDING to IN_REVIEW", domain.ComplaintStatusPending, domain.ComplaintStatusInReview},
		{"PENDING to RESOLVED", domain.ComplaintStatusPending, domain.ComplaintStatusResolved},
		{"PENDING to REJECTED", domain.ComplaintStatusPending, domain.ComplaintStatusRejected},
		{"PENDING to PENDING (idempotent)", domain.ComplaintStatusPending, domain.ComplaintStatusPending},

		// IN_REVIEW -> transitions
		{"IN_REVIEW to RESOLVED", domain.ComplaintStatusInReview, domain.ComplaintStatusResolved},
		{"IN_REVIEW to REJECTED", domain.ComplaintStatusInReview, domain.ComplaintStatusRejected},
		{"IN_REVIEW to PENDING", domain.ComplaintStatusInReview, domain.ComplaintStatusPending},
		{"IN_REVIEW to IN_REVIEW (idempotent)", domain.ComplaintStatusInReview, domain.ComplaintStatusInReview},

		// RESOLVED -> transitions
		{"RESOLVED to IN_REVIEW (reopening)", domain.ComplaintStatusResolved, domain.ComplaintStatusInReview},
		{"RESOLVED to RESOLVED (idempotent/adminResponse update)", domain.ComplaintStatusResolved, domain.ComplaintStatusResolved},

		// REJECTED -> transitions
		{"REJECTED to IN_REVIEW (appeal)", domain.ComplaintStatusRejected, domain.ComplaintStatusInReview},
		{"REJECTED to REJECTED (idempotent)", domain.ComplaintStatusRejected, domain.ComplaintStatusRejected},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.ValidateTransition(tt.current, tt.next)
			if err != nil {
				t.Errorf("Se esperaba que la transición fuera válida, pero falló: %v", err)
			}
		})
	}
}

func TestComplaintService_ValidateTransition_InvalidTransitions(t *testing.T) {
	svc := service.NewComplaintService()

	tests := []struct {
		name    string
		current domain.ComplaintStatus
		next    domain.ComplaintStatus
	}{
		// RESOLVED cannot jump directly to REJECTED or PENDING
		{"RESOLVED directly to REJECTED", domain.ComplaintStatusResolved, domain.ComplaintStatusRejected},
		{"RESOLVED directly to PENDING", domain.ComplaintStatusResolved, domain.ComplaintStatusPending},

		// REJECTED cannot jump directly to RESOLVED or PENDING
		{"REJECTED directly to RESOLVED", domain.ComplaintStatusRejected, domain.ComplaintStatusResolved},
		{"REJECTED directly to PENDING", domain.ComplaintStatusRejected, domain.ComplaintStatusPending},

		// Unknown / invalid status
		{"Unknown current status", domain.ComplaintStatus("UNKNOWN"), domain.ComplaintStatusInReview},
		{"Unknown target status", domain.ComplaintStatusPending, domain.ComplaintStatus("CANCELLED")},
		{"Empty current status", domain.ComplaintStatus(""), domain.ComplaintStatusResolved},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.ValidateTransition(tt.current, tt.next)
			if err == nil {
				t.Errorf("Se esperaba que la transición fallara, pero fue aceptada: %s -> %s", tt.current, tt.next)
			}
		})
	}
}

func TestComplaintService_IsValidRating(t *testing.T) {
	svc := service.NewComplaintService()

	one, two, three, four, five := 1, 2, 3, 4, 5
	zero, six, neg := 0, 6, -1

	if !svc.IsValidRating(nil) {
		t.Errorf("Rating nil debe ser permitido como opcional")
	}
	for _, valid := range []*int{&one, &two, &three, &four, &five} {
		if !svc.IsValidRating(valid) {
			t.Errorf("Rating %d debería ser válido", *valid)
		}
	}
	for _, invalid := range []*int{&zero, &six, &neg} {
		if svc.IsValidRating(invalid) {
			t.Errorf("Rating %d debería ser inválido", *invalid)
		}
	}
}

func TestComplaintService_IsValidCategory(t *testing.T) {
	svc := service.NewComplaintService()

	validCategories := []domain.ComplaintCategory{
		domain.ComplaintCategoryOvercrowding,
		domain.ComplaintCategoryDelay,
		domain.ComplaintCategoryDriverBehavior,
		domain.ComplaintCategoryFaresPayment,
		domain.ComplaintCategoryVehicleCondition,
		domain.ComplaintCategoryAccessibility,
		domain.ComplaintCategoryOther,
	}

	for _, cat := range validCategories {
		if !svc.IsValidCategory(cat) {
			t.Errorf("Categoría %s debería ser válida", cat)
		}
	}

	if svc.IsValidCategory(domain.ComplaintCategory("INVALID_CAT")) {
		t.Errorf("Categoría INVALID_CAT no debería ser válida")
	}
}
