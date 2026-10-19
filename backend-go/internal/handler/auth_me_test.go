package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/token"
)

func TestMeWithoutAuthenticatedUserReturns401(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewAuthHandler(nil, "me-test-secret", time.Minute, time.Hour, token.NewMemoryStore())
	r := gin.New()
	// Ruta registrada sin Authenticate: antes userID.(string) hacía panic (500).
	r.GET("/me", h.Me)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/me", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without authenticated user, got %d", w.Code)
	}
}
