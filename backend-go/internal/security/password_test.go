package security

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		expectError bool
	}{
		{"Valid password 8 chars", "secret12", false},
		{"Valid strong password", "Passw0rdSecure!2026", false},
		{"Too short password (7 chars)", "short12", true},
		{"Empty password", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashPassword(tt.password)
			if (err != nil) != tt.expectError {
				t.Fatalf("expected error: %v, got: %v", tt.expectError, err)
			}
			if !tt.expectError {
				if hash == "" {
					t.Fatalf("expected non-empty hash")
				}
				// Verify salt cost is at least 10 (we set 12)
				cost, err := bcrypt.Cost([]byte(hash))
				if err != nil {
					t.Fatalf("could not get bcrypt cost: %v", err)
				}
				if cost < 10 || cost != BcryptCost {
					t.Fatalf("expected bcrypt cost %d, got %d", BcryptCost, cost)
				}
			}
		})
	}
}

func TestComparePassword(t *testing.T) {
	password := "SecureTransport2026!"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if !ComparePassword(password, hash) {
		t.Errorf("ComparePassword failed to match correct password")
	}

	if ComparePassword("WrongPassword123!", hash) {
		t.Errorf("ComparePassword matched an incorrect password")
	}

	if ComparePassword("", hash) {
		t.Errorf("ComparePassword matched empty password")
	}

	if ComparePassword(password, "") {
		t.Errorf("ComparePassword matched empty hash")
	}
}

func TestUserNeverSerializesPasswordHash(t *testing.T) {
	u := domain.User{
		ID:           "usr-test-1",
		Name:         "Usuario Seguro",
		Email:        "usuario@transporte.cl",
		PasswordHash: "$2a$12$somehashedsupersecretpassword",
		Role:         domain.UserRolePassenger,
		IsActive:     true,
	}

	bytes, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("failed to marshal user: %v", err)
	}

	jsonStr := string(bytes)
	if strings.Contains(jsonStr, "passwordHash") || strings.Contains(jsonStr, "PasswordHash") || strings.Contains(jsonStr, "somehashedsupersecretpassword") {
		t.Errorf("Security flaw: User model leaked passwordHash in JSON: %s", jsonStr)
	}
}

