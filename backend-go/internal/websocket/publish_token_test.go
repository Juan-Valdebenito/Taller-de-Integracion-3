package websocket

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// Publicar posiciones exige un token con las mismas reglas que la API REST:
// antes se aceptaban tokens revocados (después de cerrar sesión) y tokens de
// renovación.

func signToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func accessClaims(jti string) jwt.MapClaims {
	return jwt.MapClaims{"id": "u1", "role": "COMPANY", "type": "access", "jti": jti, "exp": time.Now().Add(time.Hour).Unix()}
}

type failingStore struct{ token.RevocationStore }

func (failingStore) IsRevoked(string) (bool, error) { return false, errors.New("redis caído") }

func TestValidatePublishToken(t *testing.T) {
	store := token.NewMemoryStore()
	if err := store.Revoke("jti-revocado", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	refresh := accessClaims("jti-refresh")
	refresh["type"] = "refresh"
	noType := accessClaims("jti-sin-tipo")
	delete(noType, "type")
	expired := accessClaims("jti-vencido")
	expired["exp"] = time.Now().Add(-time.Minute).Unix()
	noJTI := accessClaims("")
	delete(noJTI, "jti")

	tests := []struct {
		name    string
		store   token.RevocationStore
		token   string
		wantErr bool
	}{
		{"access token válido", store, signToken(t, testJWTSecret, accessClaims("jti-ok")), false},
		{"token revocado", store, signToken(t, testJWTSecret, accessClaims("jti-revocado")), true},
		{"token de renovación", store, signToken(t, testJWTSecret, refresh), true},
		{"sin tipo", store, signToken(t, testJWTSecret, noType), true},
		{"vencido", store, signToken(t, testJWTSecret, expired), true},
		{"sin jti", store, signToken(t, testJWTSecret, noJTI), true},
		{"firmado con otro secreto", store, signToken(t, "otro-secreto", accessClaims("jti-ok")), true},
		{"basura", store, "no-es-un-jwt", true},
		{"no se puede consultar la revocación (fail-closed)", failingStore{}, signToken(t, testJWTSecret, accessClaims("jti-ok")), true},
		{"sin almacén de revocación (demo)", nil, signToken(t, testJWTSecret, accessClaims("jti-revocado")), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims, problem := validatePublishToken(testJWTSecret, tt.store, tt.token)
			if (problem != "") != tt.wantErr {
				t.Fatalf("problem = %q, wantErr %v", problem, tt.wantErr)
			}
			if !tt.wantErr && claims["role"] != "COMPANY" {
				t.Errorf("claims = %v", claims)
			}
		})
	}
}

// De punta a punta: después de cerrar sesión (token revocado) ya no se puede publicar.
func TestIntegration_PublishWithRevokedToken(t *testing.T) {
	store := token.NewMemoryStore()
	hub := NewHub(service.NewOccupancyService())
	go hub.Run()
	server := httptest.NewServer(http.Handler(NewWSHandler(hub, testJWTSecret, []string{"http://localhost"}).WithRevocation(store)))
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()
	time.Sleep(50 * time.Millisecond)

	signed := signToken(t, testJWTSecret, accessClaims("jti-logout"))
	if err := store.Revoke("jti-logout", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	sendJSON(t, conn, PublishMessage{Type: "publish", Token: signed, Data: BusLocationData{BusID: "BUS-101", RouteID: "route-1"}})

	var errMsg ErrorMessage
	readJSON(t, conn, &errMsg)
	if errMsg.Type != "error" || errMsg.Code != "AUTH_REQUIRED" {
		t.Fatalf("got %+v", errMsg)
	}
}
