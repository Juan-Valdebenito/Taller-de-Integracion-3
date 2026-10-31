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
