package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequireDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, tc := range []struct {
		name      string
		available bool
		want      int
	}{
		{"BD disponible: deja pasar", true, http.StatusNoContent},
		{"sin BD: 503 sin llegar al handler", false, http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reached := false
			r := gin.New()
			r.GET("/x", RequireDatabase(tc.available), func(c *gin.Context) {
				reached = true
				c.Status(http.StatusNoContent)
			})
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

			if w.Code != tc.want {
				t.Fatalf("expected %d, got %d", tc.want, w.Code)
			}
			if reached != tc.available {
				t.Fatalf("handler reached=%v, want %v", reached, tc.available)
			}
		})
	}
}
