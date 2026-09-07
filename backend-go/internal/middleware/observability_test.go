package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthAndReadinessEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/healthz", Healthz)
	r.GET("/readyz", Readyz(func() error { return nil }))
	r.GET("/not-ready", Readyz(func() error { return errors.New("database unavailable") }))

	for _, test := range []struct {
		path string
		want int
	}{{"/healthz", http.StatusOK}, {"/readyz", http.StatusOK}, {"/not-ready", http.StatusServiceUnavailable}} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, test.path, nil))
		if w.Code != test.want {
			t.Errorf("%s: got status %d, want %d", test.path, w.Code, test.want)
		}
	}
}

func TestMetricsCountsRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	metrics := NewMetrics()
	r := gin.New()
	r.Use(metrics.CollectHTTP())
	r.GET("/ping", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	r.GET("/metrics", metrics.Prometheus)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ping", nil))
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if !strings.Contains(w.Body.String(), `app_http_requests_total{method="GET",path="/ping",status="204"} 1`) {
		t.Fatalf("metric /ping not found: %s", w.Body.String())
	}
}
