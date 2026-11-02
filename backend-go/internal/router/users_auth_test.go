package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

// La gestión de usuarios es solo para administradores: antes cualquiera podía
// listar cuentas, cambiar roles (incluso a ADMIN) o desactivarlas.

func setupUsers(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	// Handler sin base de datos: las pruebas cortan antes de usarla.
	return Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, handler.NewUserHandler(nil), nil, nil, nil, nil, nil)
}

var userRoutes = []routeCase{
	{http.MethodGet, "/api/v1/users"},
	{http.MethodGet, "/api/v1/users/u1"},
	{http.MethodPost, "/api/v1/users"},
	{http.MethodPut, "/api/v1/users/u1"},
	{http.MethodPatch, "/api/v1/users/u1"},
	{http.MethodDelete, "/api/v1/users/u1"},
}

func serveUsers(r *gin.Engine, method, path, bearer, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestUserRoutesRequireSession(t *testing.T) {
	r := setupUsers(t)
	for _, rc := range userRoutes {
		if w := serveUsers(r, rc.method, rc.path, "", `{"name":"x"}`); w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s sin token: got %d", rc.method, rc.path, w.Code)
		}
	}
}

func TestUserRoutesRejectNonAdmins(t *testing.T) {
	r := setupUsers(t)
	for _, role := range []string{"PASSENGER", "COMPANY"} {
		bearer := accessToken(t, "usr-"+strings.ToLower(role), role)
		for _, rc := range userRoutes {
			if w := serveUsers(r, rc.method, rc.path, bearer, `{"name":"x","role":"ADMIN"}`); w.Code != http.StatusForbidden {
				t.Errorf("%s %s como %s: got %d", rc.method, rc.path, role, w.Code)
			}
		}
	}
}

// El administrador pasa la autorización y llega a la validación de la cuenta nueva.
func TestAdminCreateUserValidation(t *testing.T) {
	r := setupUsers(t)
	bearer := accessToken(t, "usr-admin", "ADMIN")

	w := serveUsers(r, http.MethodPost, "/api/v1/users", bearer,
		`{"name":"Operador","email":"operador@test.cl","password":"Password123!","role":"COMPANY"}`)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "companyId") {
		t.Errorf("empresa sin companyId: got %d %s", w.Code, w.Body.String())
	}

	w = serveUsers(r, http.MethodPost, "/api/v1/users", bearer,
		`{"name":"Operador","email":"operador@test.cl","password":"Password123!","role":"ROOT"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("rol inválido: got %d %s", w.Code, w.Body.String())
	}

	// La contraseña corta la frena el middleware de validación.
	w = serveUsers(r, http.MethodPost, "/api/v1/users", bearer, `{"name":"Operador","email":"operador@test.cl","password":"corta"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("contraseña corta: got %d %s", w.Code, w.Body.String())
	}
}

// El administrador no puede dejarse fuera del panel, y un rol inválido es 400
// (antes era un 500 con el error de la base de datos).
func TestAdminCannotLockThemselvesOut(t *testing.T) {
	r := setupUsers(t)
	bearer := accessToken(t, "usr-admin", "ADMIN")

	cases := []struct {
		method, body string
	}{
		{http.MethodPatch, `{"role":"PASSENGER"}`},
		{http.MethodPatch, `{"isActive":false}`},
		{http.MethodPut, `{"name":"Admin","role":"COMPANY"}`},
		{http.MethodPut, `{"name":"Admin","role":"ADMIN","isActive":false}`},
		{http.MethodDelete, ``},
	}
	for _, tc := range cases {
		if w := serveUsers(r, tc.method, "/api/v1/users/usr-admin", bearer, tc.body); w.Code != http.StatusForbidden {
			t.Errorf("%s %s sobre sí mismo: got %d %s", tc.method, tc.body, w.Code, w.Body.String())
		}
	}

	for _, method := range []string{http.MethodPatch, http.MethodPut} {
		w := serveUsers(r, method, "/api/v1/users/otro", bearer, `{"name":"X","role":"SUPERADMIN"}`)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s rol inválido: got %d %s", method, w.Code, w.Body.String())
		}
	}
}

// Registrar el teléfono para notificaciones exige sesión; sin base de datos, 503.
func TestPushTokenRoutes(t *testing.T) {
	r := setupUsers(t) // sin handler de push: modo sin base de datos
	if w := serveUsers(r, http.MethodPut, "/api/v1/me/push-token", "", `{}`); w.Code != http.StatusServiceUnavailable && w.Code != http.StatusUnauthorized {
		t.Errorf("PUT sin base ni token: got %d", w.Code)
	}

	withPush := Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, nil, nil, handler.NewPushTokenHandler(nil))
	for _, method := range []string{http.MethodPut, http.MethodDelete} {
		if w := serveUsers(withPush, method, "/api/v1/me/push-token", "", `{"token":"x"}`); w.Code != http.StatusUnauthorized {
			t.Errorf("%s sin token: got %d", method, w.Code)
		}
	}
	// Con sesión, un token inválido se rechaza antes de tocar la base.
	bearer := accessToken(t, "usr-pass-01", "PASSENGER")
	if w := serveUsers(withPush, http.MethodPut, "/api/v1/me/push-token", bearer, `{"token":"x","platform":"ios"}`); w.Code != http.StatusBadRequest {
		t.Errorf("token inválido con sesión: got %d", w.Code)
	}
}

// El GPS por HTTP exige sesión de empresa o administrador.
func TestTelemetryRouteAuth(t *testing.T) {
	withTelemetry := Setup([]string{"http://localhost:5173"}, testSecret, nil, token.NewMemoryStore(),
		nil, nil, nil, nil, nil, nil, nil, nil, handler.NewTelemetryHandler(nil, nil, nil, nil, nil))
	if w := serveUsers(withTelemetry, http.MethodPost, "/api/v1/telemetry/gps", "", `{}`); w.Code != http.StatusUnauthorized {
		t.Errorf("sin token: got %d", w.Code)
	}
	if w := serveUsers(withTelemetry, http.MethodPost, "/api/v1/telemetry/gps", accessToken(t, "usr-pass-01", "PASSENGER"), `{}`); w.Code != http.StatusForbidden {
		t.Errorf("pasajero: got %d", w.Code)
	}
	// Sin base de datos (sin handler) responde 503.
	if w := serveUsers(setupUsers(t), http.MethodPost, "/api/v1/telemetry/gps", accessToken(t, "usr-emp", "COMPANY"), `{}`); w.Code != http.StatusServiceUnavailable {
		t.Errorf("sin base: got %d", w.Code)
	}
}
