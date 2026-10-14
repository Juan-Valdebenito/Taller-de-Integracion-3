package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Pinger define la interfaz desacoplada para verificar la conectividad con la base de datos.
// Tanto *pgxpool.Pool como mocks de pruebas satisfacen este contrato.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler provee los endpoints de ciclo de vida (Kubernetes Probes).
type HealthHandler struct {
	pinger Pinger
}

func NewHealthHandler(pinger Pinger) *HealthHandler {
	return &HealthHandler{pinger: pinger}
}

// LivenessProbe godoc
// GET /healthz — Liveness Probe de Kubernetes
// Retorna HTTP 200 {"status": "alive"} inmediatamente para indicar que el proceso está activo.
func (h *HealthHandler) LivenessProbe(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "alive",
	})
}

// ReadinessProbe godoc
// GET /readyz — Readiness Probe de Kubernetes
// Ejecuta Ping contra la base de datos PostgreSQL.
// Si está lista retorna HTTP 200 {"status": "ready", "database": "connected"}.
// Si la conexión falla retorna HTTP 503 {"status": "unhealthy", "error": "db unreachable"}.
func (h *HealthHandler) ReadinessProbe(c *gin.Context) {
	if h.pinger == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "unhealthy",
			"error":  "db unreachable",
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	if err := h.pinger.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "unhealthy",
			"error":  "db unreachable",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "ready",
		"database": "connected",
	})
}
