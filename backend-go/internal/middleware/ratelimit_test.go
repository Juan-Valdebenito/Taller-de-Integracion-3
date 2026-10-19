package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// fakeClock permite avanzar el tiempo en los tests sin dormir.
type fakeClock struct{ t time.Time }

func (f *fakeClock) now() time.Time          { return f.t }
func (f *fakeClock) advance(d time.Duration) { f.t = f.t.Add(d) }

func newTestLimiter(perMinute, burst int) (*IPRateLimiter, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)}
	l := NewIPRateLimiter(RateLimitConfig{Name: "test", RequestsPerMinute: perMinute, Burst: burst, IdleTTL: 5 * time.Minute})
	l.now = clock.now
	return l, clock
}

func newRateLimitedRouter(l *IPRateLimiter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/login", l.Middleware(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	return r
}

func doLogin(r *gin.Engine, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRateLimiterAllowsBurstThenRejects(t *testing.T) {
	l, _ := newTestLimiter(6, 3) // 1 cada 10 s, ráfaga de 3
	r := newRateLimitedRouter(l)

	for i := 1; i <= 3; i++ {
		if w := doLogin(r, "203.0.113.10:5000"); w.Code != http.StatusNoContent {
			t.Fatalf("request %d: expected %d, got %d", i, http.StatusNoContent, w.Code)
		}
	}

	w := doLogin(r, "203.0.113.10:5000")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected %d after burst, got %d", http.StatusTooManyRequests, w.Code)
	}
	retryAfter, err := strconv.Atoi(w.Header().Get("Retry-After"))
	if err != nil || retryAfter < 1 || retryAfter > 10 {
		t.Fatalf("expected Retry-After between 1 and 10 seconds, got %q", w.Header().Get("Retry-After"))
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected JSON body, got %q", w.Body.String())
	}
	if body["error"] == nil || body["retryAfter"] == nil {
		t.Fatalf("expected error and retryAfter fields, got %v", body)
	}
}

func TestRateLimiterIsPerIP(t *testing.T) {
	l, _ := newTestLimiter(6, 1)
	r := newRateLimitedRouter(l)

	if w := doLogin(r, "203.0.113.10:5000"); w.Code != http.StatusNoContent {
		t.Fatalf("first IP first request: got %d", w.Code)
	}
	if w := doLogin(r, "203.0.113.10:5001"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("first IP second request (other port, same IP): expected 429, got %d", w.Code)
	}
	if w := doLogin(r, "198.51.100.7:5000"); w.Code != http.StatusNoContent {
		t.Fatalf("second IP must have its own bucket: got %d", w.Code)
	}
}

func TestRateLimiterRefillsOverTime(t *testing.T) {
	l, clock := newTestLimiter(6, 1) // 1 token cada 10 s
	r := newRateLimitedRouter(l)

	doLogin(r, "203.0.113.10:5000")
	if w := doLogin(r, "203.0.113.10:5000"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 before refill, got %d", w.Code)
	}

	clock.advance(10 * time.Second)
	if w := doLogin(r, "203.0.113.10:5000"); w.Code != http.StatusNoContent {
		t.Fatalf("expected request allowed after refill, got %d", w.Code)
	}
}

func TestRejectedRequestsDoNotConsumeTokens(t *testing.T) {
	l, clock := newTestLimiter(6, 1)
	r := newRateLimitedRouter(l)

	doLogin(r, "203.0.113.10:5000")
	// Un cliente que insiste mientras está limitado no debe alargar su propio bloqueo.
	for i := 0; i < 5; i++ {
		doLogin(r, "203.0.113.10:5000")
	}
	clock.advance(10 * time.Second)
	if w := doLogin(r, "203.0.113.10:5000"); w.Code != http.StatusNoContent {
		t.Fatalf("rejected requests should not delay recovery, got %d", w.Code)
	}
}

func TestRateLimiterCleanupRemovesIdleClients(t *testing.T) {
	l, clock := newTestLimiter(60, 5)
	l.allow("203.0.113.10")
	clock.advance(3 * time.Minute)
	l.allow("198.51.100.7")
	clock.advance(3 * time.Minute) // primera IP: 6 min inactiva (> 5); segunda: 3 min

	if removed := l.Cleanup(); removed != 1 {
		t.Fatalf("expected 1 idle client removed, got %d", removed)
	}
	if _, ok := l.visitors["198.51.100.7"]; !ok {
		t.Fatal("active client should be kept")
	}
}

func TestNewIPRateLimiterAppliesSafeDefaults(t *testing.T) {
	l := NewIPRateLimiter(RateLimitConfig{})
	if l.burst != 1 || l.idleTTL != 10*time.Minute || l.name != "default" {
		t.Fatalf("unexpected defaults: burst=%d idleTTL=%s name=%q", l.burst, l.idleTTL, l.name)
	}
	if allowed, _ := l.allow("203.0.113.10"); !allowed {
		t.Fatal("first request must be allowed")
	}
	if allowed, _ := l.allow("203.0.113.10"); allowed {
		t.Fatal("second immediate request must be rejected with the 1/min default")
	}
}
