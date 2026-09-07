package middleware

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ReadinessCheck comprueba las dependencias requeridas para atender trafico.
type ReadinessCheck func() error

// Metrics mantiene metricas HTTP minimas en memoria y las expone a Prometheus.
type Metrics struct {
	startedAt time.Time
	mu        sync.RWMutex
	requests  map[string]uint64
}

func NewMetrics() *Metrics {
	return &Metrics{startedAt: time.Now(), requests: make(map[string]uint64)}
}

// CollectHTTP registra cada respuesta HTTP. Debe instalarse antes de las rutas.
func (m *Metrics) CollectHTTP() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		path := c.FullPath()
		if path == "" {
			path = "unknown"
		}
		key := c.Request.Method + "\x00" + path + "\x00" + strconv.Itoa(c.Writer.Status())
		m.mu.Lock()
		m.requests[key]++
		m.mu.Unlock()
	}
}

// Healthz responde si el proceso sigue vivo; no consulta dependencias externas.
func Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readyz responde si el proceso esta preparado para recibir trafico.
func Readyz(check ReadinessCheck) gin.HandlerFunc {
	return func(c *gin.Context) {
		if check != nil {
			if err := check(); err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}

// Prometheus expone las metricas basicas en el formato de texto de Prometheus.
func (m *Metrics) Prometheus(c *gin.Context) {
	m.mu.RLock()
	keys := make([]string, 0, len(m.requests))
	for key := range m.requests {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	values := make(map[string]uint64, len(keys))
	for _, key := range keys {
		values[key] = m.requests[key]
	}
	m.mu.RUnlock()

	var out strings.Builder
	out.WriteString("# HELP app_http_requests_total Total de respuestas HTTP atendidas.\n# TYPE app_http_requests_total counter\n")
	for _, key := range keys {
		parts := strings.Split(key, "\x00")
		fmt.Fprintf(&out, "app_http_requests_total{method=%q,path=%q,status=%q} %d\n", parts[0], parts[1], parts[2], values[key])
	}
	out.WriteString("# HELP app_uptime_seconds Tiempo desde el inicio del proceso.\n# TYPE app_uptime_seconds gauge\n")
	fmt.Fprintf(&out, "app_uptime_seconds %.3f\n", time.Since(m.startedAt).Seconds())
	out.WriteString("# HELP app_goroutines Cantidad actual de goroutines.\n# TYPE app_goroutines gauge\n")
	fmt.Fprintf(&out, "app_goroutines %d\n", runtime.NumGoroutine())
	c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(out.String()))
}
