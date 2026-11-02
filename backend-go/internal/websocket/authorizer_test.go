package websocket

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
)

// Una empresa solo publica la posición de sus micros, en sus rutas: antes
// podía mover en el mapa las micros de cualquier empresa.

type mapUsers map[string]*domain.User
type mapBuses map[string]*domain.Bus
type mapRoutes map[string]*domain.Route
type brokenFinder struct{}

func (m mapUsers) FindByID(_ context.Context, id string) (*domain.User, error)   { return m[id], nil }
func (m mapBuses) FindByID(_ context.Context, id string) (*domain.Bus, error)    { return m[id], nil }
func (m mapRoutes) FindByID(_ context.Context, id string) (*domain.Route, error) { return m[id], nil }
func (brokenFinder) FindByID(context.Context, string) (*domain.Bus, error) {
	return nil, errors.New("base caída")
}

func companyOf(id string) *string { return &id }

func testAuthorizer() RepoAuthorizer {
	return RepoAuthorizer{
		Users: mapUsers{
			"emp-a":       {ID: "emp-a", CompanyID: companyOf("co-a")},
			"emp-sin-emp": {ID: "emp-sin-emp"},
		},
		Buses:  mapBuses{"bus-a": {ID: "bus-a", CompanyID: "co-a"}, "bus-b": {ID: "bus-b", CompanyID: "co-b"}},
		Routes: mapRoutes{"route-a": {ID: "route-a", CompanyID: "co-a"}, "route-b": {ID: "route-b", CompanyID: "co-b"}},
	}
}

func TestRepoAuthorizer(t *testing.T) {
	a := testAuthorizer()
	tests := []struct {
		name                         string
		userID, role, busID, routeID string
		allowed                      bool
	}{
		{"empresa con su micro y su ruta", "emp-a", "COMPANY", "bus-a", "route-a", true},
		{"empresa con micro de otra", "emp-a", "COMPANY", "bus-b", "route-a", false},
		{"empresa con su micro en ruta de otra", "emp-a", "COMPANY", "bus-a", "route-b", false},
		{"empresa con micro inexistente", "emp-a", "COMPANY", "bus-x", "route-a", false},
		{"empresa con ruta inexistente", "emp-a", "COMPANY", "bus-a", "route-x", false},
		{"cuenta de empresa sin empresa", "emp-sin-emp", "COMPANY", "bus-a", "route-a", false},
		{"cuenta que ya no existe", "emp-borrada", "COMPANY", "bus-a", "route-a", false},
		{"admin con cualquier micro", "adm", "ADMIN", "bus-b", "route-a", true},
		{"admin con micro inexistente", "adm", "ADMIN", "bus-x", "route-a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			problem := a.CanPublish(context.Background(), tt.userID, tt.role, tt.busID, tt.routeID)
			if (problem == "") != tt.allowed {
				t.Errorf("problem = %q, allowed %v", problem, tt.allowed)
			}
		})
	}

	a.Buses = brokenFinder{}
	if problem := a.CanPublish(context.Background(), "emp-a", "COMPANY", "bus-a", "route-a"); problem != errCannotVerify {
		t.Errorf("con la base caída: got %q", problem)
	}
	if problem := (UnavailableAuthorizer{}).CanPublish(context.Background(), "adm", "ADMIN", "bus-a", "route-a"); problem == "" {
		t.Error("sin base de datos no se debe aceptar ninguna publicación")
	}
}

// De punta a punta: la publicación de una micro ajena se rechaza con FORBIDDEN
// y no le llega a quien escucha la ruta.
func TestIntegration_PublishOtherCompanyBus(t *testing.T) {
	hub := NewHub(service.NewOccupancyService())
	go hub.Run()
	server := httptest.NewServer(http.Handler(NewWSHandler(hub, testJWTSecret, []string{"http://localhost"}).WithPublishAuthorizer(testAuthorizer())))
	defer server.Close()

	listener := dialWS(t, server)
	defer listener.Close()
	sendJSON(t, listener, SubscribeMessage{Type: "subscribe", Topic: "route", ID: "route-a"})
	publisher := dialWS(t, server)
	defer publisher.Close()
	time.Sleep(50 * time.Millisecond)

	signed := signToken(t, testJWTSecret, jwt.MapClaims{
		"id": "emp-a", "role": "COMPANY", "type": "access", "jti": "jti-emp-a", "exp": time.Now().Add(time.Hour).Unix(),
	})
	sendJSON(t, publisher, PublishMessage{Type: "publish", Token: signed, Data: BusLocationData{BusID: "bus-b", RouteID: "route-a"}})

	var errMsg ErrorMessage
	readJSON(t, publisher, &errMsg)
	if errMsg.Type != "error" || errMsg.Code != "FORBIDDEN" {
		t.Fatalf("got %+v", errMsg)
	}

	// Su propia micro sí llega.
	sendJSON(t, publisher, PublishMessage{Type: "publish", Token: signed, Data: BusLocationData{BusID: "bus-a", RouteID: "route-a", Latitude: -38.7, Longitude: -72.6}})
	var update map[string]interface{}
	readJSON(t, listener, &update)
	data, _ := update["data"].(map[string]interface{})
	if data["busId"] != "bus-a" {
		t.Fatalf("el oyente debía recibir solo bus-a, got %v", update)
	}
}
