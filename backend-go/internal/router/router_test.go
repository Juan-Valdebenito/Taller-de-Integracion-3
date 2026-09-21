package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRootEndpointReturnsInfo(t *testing.T) {
	r := Setup(
		"http://localhost:5173",
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
	)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d, body=%s", http.StatusOK, w.Code, w.Body.String())
	}
}
