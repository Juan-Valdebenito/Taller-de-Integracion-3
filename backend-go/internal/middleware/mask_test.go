package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMaskEmail(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"johndoe@dominio.cl", "j***@dominio.cl"},
		{"maria.gonzalez@transporte.cl", "m***@transporte.cl"},
		{"a@b.com", "a***@b.com"},
		{"", "***@***.com"},
		{"invalid-email", "***@***.com"},
	}

	for _, tt := range tests {
		got := MaskEmail(tt.input)
		if got != tt.expected {
			t.Errorf("MaskEmail(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestMaskPhone(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"+56912345678", "+569****5678"},
		{"912345678", "9****5678"},
		{"1234", "****"},
		{"", ""},
	}

	for _, tt := range tests {
		got := MaskPhone(tt.input)
		if got != tt.expected {
			t.Errorf("MaskPhone(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestMaskIdentifier(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"RUT", "12.345.678-9", "12.***.***-9"},
		{"UUID", "a296333c-e797-4d3f-8102-747cf72279a6", "a296****79a6"},
		{"Prefixed ID", "usr-pass-01", "usr-****-01"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MaskIdentifier(tt.input)
			if got != tt.expected {
				t.Errorf("MaskIdentifier(%q) = %q; want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestSensitiveDataMaskerMiddleware(t *testing.T) {
	r := gin.New()
	r.Use(SensitiveDataMasker())

	r.GET("/api/v1/users", func(c *gin.Context) {
		users := []map[string]interface{}{
			{
				"id":    "usr-pass-01",
				"name":  "Juan Perez",
				"email": "juan.perez@transporte.cl",
				"phone": "+56912345678",
			},
		}
		c.JSON(http.StatusOK, users)
	})

	// Test 1: Without ?mask=true -> raw data
	req1, _ := http.NewRequest(http.MethodGet, "/api/v1/users", nil)
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w1.Code)
	}

	var rawUsers []map[string]interface{}
	if err := json.Unmarshal(w1.Body.Bytes(), &rawUsers); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if rawUsers[0]["email"] != "juan.perez@transporte.cl" {
		t.Errorf("expected unmasked email without query param, got %v", rawUsers[0]["email"])
	}

	// Test 2: With ?mask=true -> masked data
	req2, _ := http.NewRequest(http.MethodGet, "/api/v1/users?mask=true", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}

	var maskedUsers []map[string]interface{}
	if err := json.Unmarshal(w2.Body.Bytes(), &maskedUsers); err != nil {
		t.Fatalf("failed to parse masked response: %v", err)
	}

	if maskedUsers[0]["email"] != "j***@transporte.cl" {
		t.Errorf("expected masked email 'j***@transporte.cl', got %v", maskedUsers[0]["email"])
	}
	if maskedUsers[0]["phone"] != "+569****5678" {
		t.Errorf("expected masked phone '+569****5678', got %v", maskedUsers[0]["phone"])
	}
}
