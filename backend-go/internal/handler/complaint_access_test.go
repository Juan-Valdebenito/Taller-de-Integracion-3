package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

func strPtr(s string) *string { return &s }

var (
	admin      = requestActor{userID: "adm", role: "ADMIN"}
	companyA   = requestActor{userID: "emp-a", role: "COMPANY", companyID: "co-a"}
	passenger  = requestActor{userID: "pas-1", role: "PASSENGER"}
	ofCompanyA = &domain.Complaint{ID: "c1", CompanyID: strPtr("co-a"), PassengerID: strPtr("pas-1")}
	ofCompanyB = &domain.Complaint{ID: "c2", CompanyID: strPtr("co-b"), PassengerID: strPtr("pas-2")}
)

func TestCompanyScope(t *testing.T) {
	if got := companyScope(admin, ""); got != nil {
		t.Errorf("admin sin filtro: got %v", *got)
	}
	if got := companyScope(admin, "co-b"); got == nil || *got != "co-b" {
		t.Errorf("admin con filtro: got %v", got)
	}
	// La empresa siempre queda limitada a la suya, pida lo que pida.
	for _, requested := range []string{"", "co-b"} {
		if got := companyScope(companyA, requested); got == nil || *got != "co-a" {
			t.Errorf("empresa pidiendo %q: got %v", requested, got)
		}
	}
}

func TestComplaintVisibility(t *testing.T) {
	tests := []struct {
		name          string
		actor         requestActor
		complaint     *domain.Complaint
		view, respond bool
	}{
		{"admin ve y responde cualquiera", admin, ofCompanyB, true, true},
		{"empresa ve y responde los suyos", companyA, ofCompanyA, true, true},
		{"empresa no ve los de otra", companyA, ofCompanyB, false, false},
		{"pasajero ve el suyo pero no responde", passenger, ofCompanyA, true, false},
		{"pasajero no ve el de otro", passenger, ofCompanyB, false, false},
		{"reclamo sin empresa: solo el admin", companyA, &domain.Complaint{ID: "c3"}, false, false},
		{"rol desconocido", requestActor{userID: "x", role: "OTRO"}, ofCompanyA, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canViewComplaint(tt.actor, tt.complaint); got != tt.view {
				t.Errorf("ver = %v, want %v", got, tt.view)
			}
			if got := canRespondComplaint(tt.actor, tt.complaint); got != tt.respond {
				t.Errorf("responder = %v, want %v", got, tt.respond)
			}
		})
	}
}

type fakeUsers struct {
	user *domain.User
	err  error
}

func (f fakeUsers) FindByID(context.Context, string) (*domain.User, error) { return f.user, f.err }

func actorRequest(h *ComplaintHandler, role string) (requestActor, bool, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/complaints", nil)
	c.Set(middleware.ContextUserID, "u1")
	c.Set(middleware.ContextUserRole, role)
	actor, ok := h.actorForComplaints(c)
	return actor, ok, w
}

func TestActorForComplaints(t *testing.T) {
	// El administrador no necesita consultar la base.
	if actor, ok, _ := actorRequest(&ComplaintHandler{}, "ADMIN"); !ok || actor.role != "ADMIN" {
		t.Fatalf("admin: %+v %v", actor, ok)
	}

	h := (&ComplaintHandler{}).WithUsers(fakeUsers{user: &domain.User{ID: "u1", CompanyID: strPtr("co-a")}})
	if actor, ok, _ := actorRequest(h, "COMPANY"); !ok || actor.companyID != "co-a" {
		t.Fatalf("empresa: %+v %v", actor, ok)
	}

	cases := []struct {
		name string
		h    *ComplaintHandler
		want int
	}{
		{"cuenta de empresa sin empresa", (&ComplaintHandler{}).WithUsers(fakeUsers{user: &domain.User{ID: "u1"}}), http.StatusForbidden},
		{"cuenta que ya no existe", (&ComplaintHandler{}).WithUsers(fakeUsers{}), http.StatusForbidden},
		{"error de la base", (&ComplaintHandler{}).WithUsers(fakeUsers{err: errors.New("caída")}), http.StatusInternalServerError},
		{"sin repositorio de usuarios", &ComplaintHandler{}, http.StatusServiceUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, ok, w := actorRequest(tc.h, "COMPANY"); ok || w.Code != tc.want {
				t.Errorf("ok=%v code=%d, want %d", ok, w.Code, tc.want)
			}
		})
	}
}
