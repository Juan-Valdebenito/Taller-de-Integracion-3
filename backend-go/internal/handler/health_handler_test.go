package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type mockPinger struct {
	err error
}

func (m *mockPinger) Ping(ctx context.Context) error {
	return m.err
}

func init() {
	gin.SetMode(gin.TestMode)
}

func TestHealthHandler_LivenessProbe(t *testing.T) {
	h := NewHealthHandler(&mockPinger{})

	r := gin.New()
	r.GET("/healthz", h.LivenessProbe)

	req, _ := http.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("se esperaba código 200 en /healthz, obtenido: %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("error al deserializar respuesta: %v", err)
	}

	if res["status"] != "alive" {
		t.Errorf("se esperaba status='alive', obtenido: %v", res["status"])
	}
}

func TestHealthHandler_ReadinessProbe_Success(t *testing.T) {
	h := NewHealthHandler(&mockPinger{err: nil})

	r := gin.New()
	r.GET("/readyz", h.ReadinessProbe)

	req, _ := http.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("se esperaba código 200 en /readyz, obtenido: %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("error al deserializar respuesta: %v", err)
	}

	if res["status"] != "ready" {
		t.Errorf("se esperaba status='ready', obtenido: %v", res["status"])
	}
	if res["database"] != "connected" {
		t.Errorf("se esperaba database='connected', obtenido: %v", res["database"])
	}
}

func TestHealthHandler_ReadinessProbe_Failure(t *testing.T) {
	h := NewHealthHandler(&mockPinger{err: errors.New("connection refused")})

	r := gin.New()
	r.GET("/readyz", h.ReadinessProbe)

	req, _ := http.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("se esperaba código 503 en /readyz con fallo de db, obtenido: %d", w.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("error al deserializar respuesta: %v", err)
	}

	if res["status"] != "unhealthy" {
		t.Errorf("se esperaba status='unhealthy', obtenido: %v", res["status"])
	}
	if res["error"] != "db unreachable" {
		t.Errorf("se esperaba error='db unreachable', obtenido: %v", res["error"])
	}
}

func TestHealthHandler_ReadinessProbe_NilPinger(t *testing.T) {
	h := NewHealthHandler(nil)

	r := gin.New()
	r.GET("/readyz", h.ReadinessProbe)

	req, _ := http.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("se esperaba código 503 cuando pinger es nil, obtenido: %d", w.Code)
	}
}
