package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// RequireDatabase protege rutas que necesitan PostgreSQL. En modo degradado
// (SIMULATION_ENABLED=true sin BD) main.go no crea sus handlers; sin esta
// guarda, la solicitud llegaría a un handler nil y terminaría en panic → 500.
// Con available=false responde 503 Service Unavailable; con true no hace nada.
func RequireDatabase(available bool) gin.HandlerFunc {
	if available {
		return func(c *gin.Context) { c.Next() }
	}
	return func(c *gin.Context) {
		log.Warn().
			Str("event", "database_unavailable").
			Str("path", c.Request.URL.Path).
			Msg("Request rejected: database unavailable (degraded mode)")
		c.Header("Retry-After", "30")
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"error": "Servicio temporalmente no disponible: la base de datos no está accesible. Intenta nuevamente en unos momentos.",
		})
	}
}
