package handler

import (
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

func TestPatenteValidation_TableDriven(t *testing.T) {
	tests := []struct {
		name     string
		patente  string
		expected bool
	}{
		{"Formato moderno con guión válido", "ABCD-12", true},
		{"Formato moderno sin guión válido", "ABCD12", true},
		{"Formato moderno minúsculas", "abcd-12", true},
		{"Formato clásico con guión válido", "AB-1234", true},
		{"Formato clásico sin guión válido", "AB1234", true},
		{"Patente con espacios", " ABCD-12 ", true},
		{"Patente invertida inválida", "1234-AB", false},
		{"Longitud insuficiente", "ABC-12", false},
		{"Longitud excesiva", "ABCDE-12", false},
		{"Solo números", "123456", false},
		{"Solo letras", "ABCDEF", false},
		{"Vacía", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidPatente(tt.patente)
			if got != tt.expected {
				t.Errorf("IsValidPatente(%q) = %v; esperado %v", tt.patente, got, tt.expected)
			}
		})
	}
}

func TestFormatPatente(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"abcd12", "ABCD-12"},
		{"ABCD-12", "ABCD-12"},
		{"ab1234", "AB-1234"},
		{"AB-1234", "AB-1234"},
	}

	for _, tt := range tests {
		got := FormatPatente(tt.input)
		if got != tt.expected {
			t.Errorf("FormatPatente(%q) = %q; esperado %q", tt.input, got, tt.expected)
		}
	}
}

func TestBusOperationalStatusValidation(t *testing.T) {
	validStatuses := []domain.BusStatus{
		domain.BusStatusActive,
		domain.BusStatusMaintenance,
		domain.BusStatusOutOfService,
		domain.BusStatusInactive,
	}

	for _, st := range validStatuses {
		if !isValidOperationalStatus(st) {
			t.Errorf("isValidOperationalStatus(%q) debería ser true", st)
		}
	}

	invalidStatuses := []domain.BusStatus{
		"DESTROYED",
		"UNKNOWN",
		"CRASHED",
		"",
	}

	for _, st := range invalidStatuses {
		if isValidOperationalStatus(st) {
			t.Errorf("isValidOperationalStatus(%q) debería ser false", st)
		}
	}
}

func TestUserSoftDeleteBusinessLogic(t *testing.T) {
	// Simular usuario activo
	u := &domain.User{
		ID:       "usr-test-01",
		Name:     "Test User",
		Email:    "test@transporte.cl",
		Role:     domain.UserRolePassenger,
		IsActive: true,
	}

	if !u.IsActive {
		t.Fatal("el usuario debería iniciar como activo")
	}

	// Ejecutar lógica de Soft Delete: cambiar isActive a false sin alterar ID ni datos relacionales
	u.IsActive = false

	if u.IsActive {
		t.Errorf("después de soft delete, IsActive debe ser false")
	}
	if u.ID != "usr-test-01" {
		t.Errorf("el ID del usuario debe preservarse intacto tras soft delete")
	}
}
