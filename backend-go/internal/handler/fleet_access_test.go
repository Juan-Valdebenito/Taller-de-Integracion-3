package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

func TestBelongsToActor(t *testing.T) {
	tests := []struct {
		name      string
		actor     requestActor
		companyID string
		want      bool
	}{
		{"admin modifica cualquiera", requestActor{role: "ADMIN"}, "co-b", true},
		{"empresa modifica las suyas", requestActor{role: "COMPANY", companyID: "co-a"}, "co-a", true},
		{"empresa no modifica las de otra", requestActor{role: "COMPANY", companyID: "co-a"}, "co-b", false},
		{"empresa no modifica algo sin empresa", requestActor{role: "COMPANY", companyID: "co-a"}, "", false},
		{"pasajero no modifica nada", requestActor{role: "PASSENGER"}, "co-a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := belongsToActor(tt.actor, tt.companyID); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

type fakeRoutes struct {
	byID map[string]*domain.Route
	err  error
}

func (f fakeRoutes) FindByID(_ context.Context, id string) (*domain.Route, error) {
	return f.byID[id], f.err
}

func TestCheckRouteForCompany(t *testing.T) {
	gin.SetMode(gin.TestMode)
	routes := fakeRoutes{byID: map[string]*domain.Route{"r-a": {ID: "r-a", CompanyID: "co-a"}}}
	check := func(finder routeFinder, routeID *string) (bool, int) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/buses", nil)
		ok := checkRouteForCompany(c, finder, routeID, "co-a")
		return ok, w.Code
	}

	for _, routeID := range []*string{nil, strPtr(""), strPtr("  "), strPtr("r-a")} {
		if ok, _ := check(routes, routeID); !ok {
			t.Errorf("ruta %v debía aceptarse", routeID)
		}
	}
	if ok, code := check(routes, strPtr("r-de-otra")); ok || code != http.StatusBadRequest {
		t.Errorf("ruta inexistente: ok=%v code=%d", ok, code)
	}
	other := fakeRoutes{byID: map[string]*domain.Route{"r-b": {ID: "r-b", CompanyID: "co-b"}}}
	if ok, code := check(other, strPtr("r-b")); ok || code != http.StatusBadRequest {
		t.Errorf("ruta de otra empresa: ok=%v code=%d", ok, code)
	}
	if ok, code := check(fakeRoutes{err: errors.New("caída")}, strPtr("r-a")); ok || code != http.StatusInternalServerError {
		t.Errorf("error de la base: ok=%v code=%d", ok, code)
	}
}
