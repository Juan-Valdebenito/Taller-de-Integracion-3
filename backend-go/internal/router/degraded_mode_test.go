package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// En modo degradado (SIMULATION_ENABLED=true sin BD) main.go no crea los
// handlers que usan PostgreSQL. Antes, estas rutas llegaban a un handler nil y
// terminaban en panic → 500; ahora deben responder 503.
func TestDegradedModeReturns503InsteadOfPanicking(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := Setup([]string{"http://localhost:5173"}, "test-secret", nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	cases := []struct{ method, path string }{
		{http.MethodPost, "/api/v1/auth/login"},
		{http.MethodPost, "/api/v1/auth/register"},
		{http.MethodPost, "/api/v1/auth/refresh"},
		{http.MethodGet, "/api/v1/auth/me"},
		{http.MethodGet, "/api/v1/users"},
		{http.MethodGet, "/api/v1/buses"},
		{http.MethodPost, "/api/v1/buses/simulate-event"},
		{http.MethodGet, "/api/v1/routes"},
		{http.MethodPost, "/api/v1/complaints"},
		{http.MethodGet, "/api/v1/complaints/stats"},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"email":"ana@correo.cl","password":"secreta123"}`))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusServiceUnavailable {
				t.Fatalf("expected 503, got %d (body=%s)", w.Code, w.Body.String())
			}
			if w.Header().Get("Retry-After") == "" {
				t.Fatal("expected Retry-After header")
			}
			var body map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["error"] == "" {
				t.Fatalf("expected JSON error message, got %q", w.Body.String())
			}
		})
	}
}

func TestDegradedModeKeepsInfrastructureEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := Setup([]string{"http://localhost:5173"}, "test-secret", nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	for _, path := range []string{"/", "/health", "/healthz", "/readyz"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK {
			t.Errorf("GET %s: expected 200 in degraded mode, got %d", path, w.Code)
		}
	}
}
