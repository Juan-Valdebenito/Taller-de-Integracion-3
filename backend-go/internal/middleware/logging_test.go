package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestLoggerSetsAndPropagatesRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestLogger())
	r.GET("/generated", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	r.GET("/provided", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	generated := httptest.NewRecorder()
	r.ServeHTTP(generated, httptest.NewRequest(http.MethodGet, "/generated", nil))
	if generated.Header().Get(requestIDHeader) == "" {
		t.Fatal("expected generated request ID")
	}

	provided := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/provided", nil)
	request.Header.Set(requestIDHeader, "request-from-client")
	r.ServeHTTP(provided, request)
	if got := provided.Header().Get(requestIDHeader); got != "request-from-client" {
		t.Fatalf("expected propagated request ID, got %q", got)
	}
}
