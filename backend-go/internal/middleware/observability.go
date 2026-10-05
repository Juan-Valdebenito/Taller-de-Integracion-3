package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ReadinessCheck comprueba las dependencias requeridas para atender trafico.
type ReadinessCheck func() error

// Metrics agrupa las metricas HTTP expuestas a Prometheus vía prometheus/client_golang.
type Metrics struct {
	registry        *prometheus.Registry
	requestsTotal   *prometheus.CounterVec
	requestDuration *prometheus.HistogramVec
}

func NewMetrics() *Metrics {
	registry := prometheus.NewRegistry()
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	requestsTotal := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "app_http_requests_total",
			Help: "Total de respuestas HTTP atendidas.",
		},
		[]string{"method", "path", "status"},
	)
	requestDuration := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "app_http_request_duration_seconds",
			Help:    "Duracion de las peticiones HTTP en segundos.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path", "status"},
	)
	registry.MustRegister(requestsTotal, requestDuration)

	return &Metrics{registry: registry, requestsTotal: requestsTotal, requestDuration: requestDuration}
}

// CollectHTTP registra cada respuesta HTTP. Debe instalarse antes de las rutas.
func (m *Metrics) CollectHTTP() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		path := c.FullPath()
		if path == "" {
			path = "unknown"
		}
		status := strconv.Itoa(c.Writer.Status())

		m.requestsTotal.WithLabelValues(c.Request.Method, path, status).Inc()
		m.requestDuration.WithLabelValues(c.Request.Method, path, status).Observe(time.Since(start).Seconds())
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

// Prometheus expone las metricas en el formato de texto que espera un scraper de Prometheus.
func (m *Metrics) Prometheus() gin.HandlerFunc {
	return gin.WrapH(promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{}))
}
