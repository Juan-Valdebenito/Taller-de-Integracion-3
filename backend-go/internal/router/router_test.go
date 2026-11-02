package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRootEndpointReturnsInfo(t *testing.T) {
	r := Setup(
		[]string{"http://localhost:5173"},
		"test-secret",
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
	)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d, body=%s", http.StatusOK, w.Code, w.Body.String())
	}
}

func TestCORSAllowsEveryConfiguredOrigin(t *testing.T) {
	r := Setup([]string{"http://localhost:5173", "http://localhost:8081"}, "test-secret", nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	preflight := func(origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/login", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.Header.Set("Access-Control-Request-Headers", "Content-Type")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Frontend web y vista previa web de la app móvil (Expo).
	for _, origin := range []string{"http://localhost:5173", "http://localhost:8081"} {
		if got := preflight(origin).Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Errorf("origin %s: expected Access-Control-Allow-Origin %q, got %q", origin, origin, got)
		}
	}

	w := preflight("http://evil.example")
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unlisted origin must not be allowed, got Access-Control-Allow-Origin %q", got)
	}
	if w.Code != http.StatusForbidden {
		t.Errorf("unlisted origin preflight: expected %d, got %d", http.StatusForbidden, w.Code)
	}
}
