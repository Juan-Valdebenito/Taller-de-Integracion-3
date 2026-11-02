package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

func TestValidateNewUser(t *testing.T) {
	tests := []struct {
		name        string
		req         NewUserRequest
		wantRole    domain.UserRole
		wantCompany string
		wantErr     bool
	}{
		{"sin rol es pasajero", NewUserRequest{}, domain.UserRolePassenger, "", false},
		{"administrador", NewUserRequest{Role: "ADMIN"}, domain.UserRoleAdmin, "", false},
		{"empresa con su empresa", NewUserRequest{Role: "COMPANY", CompanyID: " co1 "}, domain.UserRoleCompany, "co1", false},
		{"empresa sin empresa", NewUserRequest{Role: "COMPANY"}, "", "", true},
		{"rol inventado", NewUserRequest{Role: "SUPERADMIN"}, "", "", true},
		{"la empresa se ignora si no es rol Empresa", NewUserRequest{Role: "PASSENGER", CompanyID: "co1"}, domain.UserRolePassenger, "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			role, companyID, msg := validateNewUser(tt.req)
			if (msg != "") != tt.wantErr {
				t.Fatalf("error = %q, wantErr %v", msg, tt.wantErr)
			}
			if role != tt.wantRole {
				t.Errorf("role = %q, want %q", role, tt.wantRole)
			}
			got := ""
			if companyID != nil {
				got = *companyID
			}
			if got != tt.wantCompany {
				t.Errorf("companyId = %q, want %q", got, tt.wantCompany)
			}
		})
	}
}

func TestRegistrationRole(t *testing.T) {
	if _, ok := registrationRole("ADMIN"); ok {
		t.Error("el registro público no debe permitir ADMIN")
	}
	if role, ok := registrationRole("COMPANY"); !ok || role != domain.UserRoleCompany {
		t.Errorf("COMPANY: got %q, %v", role, ok)
	}
	for _, requested := range []string{"", "PASSENGER", "otro"} {
		if role, ok := registrationRole(requested); !ok || role != domain.UserRolePassenger {
			t.Errorf("%q: got %q, %v", requested, role, ok)
		}
	}
}

// Registrarse como ADMIN responde 403 antes de tocar la base de datos.
func TestRegisterRejectsAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &AuthHandler{}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auth/register",
		strings.NewReader(`{"name":"Intruso","email":"intruso@test.cl","password":"Password123!","role":"ADMIN"}`))
	c.Request.Header.Set("Content-Type", "application/json")

	h.Register(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestSelfChangeError(t *testing.T) {
	passenger, admin := domain.UserRolePassenger, domain.UserRoleAdmin
	off, on := false, true
	tests := []struct {
		name     string
		actor    string
		role     *domain.UserRole
		isActive *bool
		wantErr  bool
	}{
		{"quitarse el rol", "u1", &passenger, nil, true},
		{"desactivarse", "u1", nil, &off, true},
		{"seguir siendo admin y activo", "u1", &admin, &on, false},
		{"cambiar solo el nombre", "u1", nil, nil, false},
		{"a otra cuenta sí puede", "u2", &passenger, &off, false},
		{"sin actor (sin sesión)", "", &passenger, &off, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := selfChangeError(tt.actor, "u1", tt.role, tt.isActive); (got != "") != tt.wantErr {
				t.Errorf("got %q, wantErr %v", got, tt.wantErr)
			}
		})
	}
}

func TestParseRole(t *testing.T) {
	if role, ok := parseRole(" COMPANY "); !ok || role != domain.UserRoleCompany {
		t.Errorf("COMPANY: got %q %v", role, ok)
	}
	for _, raw := range []string{"", "admin", "ROOT"} {
		if _, ok := parseRole(raw); ok {
			t.Errorf("%q no debería ser un rol válido", raw)
		}
	}
}
