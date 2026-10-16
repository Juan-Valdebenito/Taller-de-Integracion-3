package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/handler"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// setupWithAuthLimits arma el router real con un AuthHandler sin BD: las
// solicitudes con body vacío responden 400 en el handler, lo que basta para
// distinguir "pasó el limitador" (400) de "lo cortó el limitador" (429).
func setupWithAuthLimits(t *testing.T, limits *middleware.AuthRateLimiters) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	authH := handler.NewAuthHandler(nil, "test-secret", 15*time.Minute, time.Hour, nil)
	return Setup("http://localhost:5173", "test-secret", nil, nil, authH,
		nil, nil, nil, nil, nil, nil, nil, limits)
}

func post(r *gin.Engine, path, remoteAddr string) int {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func newLimits(t *testing.T, credBurst, tokenBurst int) *middleware.AuthRateLimiters {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return middleware.NewAuthRateLimiters(ctx,
		middleware.RateLimitConfig{Name: "auth", RequestsPerMinute: 1, Burst: credBurst},
		middleware.RateLimitConfig{Name: "token", RequestsPerMinute: 1, Burst: tokenBurst},
	)
}

func TestLoginAndRegisterShareCredentialsLimit(t *testing.T) {
	r := setupWithAuthLimits(t, newLimits(t, 3, 10))
	const ip = "203.0.113.10:4000"

	// login y registro comparten el mismo balde: alternarlos no evita el límite.
	for i, path := range []string{"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/login"} {
		if code := post(r, path, ip); code == http.StatusTooManyRequests {
			t.Fatalf("request %d to %s should pass the limiter, got 429", i+1, path)
		}
	}
	if code := post(r, "/api/v1/auth/register", ip); code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after burst on register, got %d", code)
	}
	if code := post(r, "/api/v1/auth/login", ip); code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after burst on login, got %d", code)
	}
}

func TestTokenRotationHasItsOwnLimit(t *testing.T) {
	r := setupWithAuthLimits(t, newLimits(t, 1, 2))
	const ip = "203.0.113.10:4000"

	// Agotar el límite de credenciales no bloquea el refresh de tokens.
	post(r, "/api/v1/auth/login", ip)
	if code := post(r, "/api/v1/auth/login", ip); code != http.StatusTooManyRequests {
		t.Fatalf("expected login limited, got %d", code)
	}
	for i := 1; i <= 2; i++ {
		if code := post(r, "/api/v1/auth/refresh", ip); code == http.StatusTooManyRequests {
			t.Fatalf("refresh %d should use its own bucket, got 429", i)
		}
	}
	if code := post(r, "/api/v1/auth/refresh", ip); code != http.StatusTooManyRequests {
		t.Fatalf("expected refresh limited after its burst, got %d", code)
	}
	// logout comparte el balde de tokens (y el límite actúa antes que la autenticación).
	if code := post(r, "/api/v1/auth/logout", ip); code != http.StatusTooManyRequests {
		t.Fatalf("expected logout limited with token bucket, got %d", code)
	}
}

func TestAuthRoutesWithoutLimitersAreNotLimited(t *testing.T) {
	r := setupWithAuthLimits(t, nil)
	for i := 0; i < 20; i++ {
		if code := post(r, "/api/v1/auth/login", "203.0.113.10:4000"); code == http.StatusTooManyRequests {
			t.Fatalf("request %d: no limiter configured, got 429", i+1)
		}
	}
}

func TestMeEndpointIsNotRateLimited(t *testing.T) {
	r := setupWithAuthLimits(t, newLimits(t, 1, 1))
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.RemoteAddr = "203.0.113.10:4000"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("/auth/me should not be rate limited, got 429 on request %d", i+1)
		}
	}
}
