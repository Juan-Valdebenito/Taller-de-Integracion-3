package middleware

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"golang.org/x/time/rate"
)

// RateLimitConfig define cuántas solicitudes por minuto acepta un cliente (IP)
// y cuántas puede hacer seguidas antes de que empiece a regir el ritmo (ráfaga).
type RateLimitConfig struct {
	// Name identifica el limitador en logs y respuestas (ej. "auth", "token").
	Name string
	// RequestsPerMinute es el ritmo sostenido permitido por cliente.
	RequestsPerMinute int
	// Burst es la cantidad de solicitudes seguidas permitidas antes de limitar.
	Burst int
	// IdleTTL es cuánto tiempo sin actividad se conserva el estado de un cliente
	// antes de liberarlo de memoria. Por defecto 10 minutos.
	IdleTTL time.Duration
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// IPRateLimiter limita solicitudes por IP de cliente con el algoritmo token
// bucket de golang.org/x/time/rate: cada IP tiene su propio "balde" que se
// rellena a RequestsPerMinute y admite hasta Burst solicitudes seguidas.
//
// El estado vive en memoria del proceso: con varias réplicas cada una limita
// por separado (el límite efectivo se multiplica por el número de réplicas).
type IPRateLimiter struct {
	name     string
	limit    rate.Limit
	burst    int
	idleTTL  time.Duration
	now      func() time.Time
	mu       sync.Mutex
	visitors map[string]*visitor
}

// NewIPRateLimiter crea un limitador por IP. Valores no positivos se reemplazan
// por mínimos seguros (1 solicitud por minuto, ráfaga de 1).
func NewIPRateLimiter(cfg RateLimitConfig) *IPRateLimiter {
	if cfg.RequestsPerMinute <= 0 {
		cfg.RequestsPerMinute = 1
	}
	if cfg.Burst <= 0 {
		cfg.Burst = 1
	}
	if cfg.IdleTTL <= 0 {
		cfg.IdleTTL = 10 * time.Minute
	}
	if cfg.Name == "" {
		cfg.Name = "default"
	}
	return &IPRateLimiter{
		name:     cfg.Name,
		limit:    rate.Limit(float64(cfg.RequestsPerMinute) / 60.0),
		burst:    cfg.Burst,
		idleTTL:  cfg.IdleTTL,
		now:      time.Now,
		visitors: make(map[string]*visitor),
	}
}

// allow registra una solicitud de key. Si se excede el límite devuelve false y
// cuánto debe esperar el cliente antes de reintentar.
func (l *IPRateLimiter) allow(key string) (bool, time.Duration) {
	now := l.now()

	l.mu.Lock()
	v, ok := l.visitors[key]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[key] = v
	}
	v.lastSeen = now
	reservation := v.limiter.ReserveN(now, 1)
	l.mu.Unlock()

	if !reservation.OK() {
		return false, time.Minute
	}
	if delay := reservation.DelayFrom(now); delay > 0 {
		// No se consume el token: la solicitud se rechaza en vez de esperar.
		reservation.CancelAt(now)
		return false, delay
	}
	return true, 0
}

// Cleanup elimina los clientes sin actividad durante más de IdleTTL y devuelve
// cuántos se eliminaron.
func (l *IPRateLimiter) Cleanup() int {
	cutoff := l.now().Add(-l.idleTTL)
	removed := 0
	l.mu.Lock()
	defer l.mu.Unlock()
	for key, v := range l.visitors {
		if v.lastSeen.Before(cutoff) {
			delete(l.visitors, key)
			removed++
		}
	}
	return removed
}

// StartCleanup ejecuta Cleanup periódicamente hasta que ctx se cancele, para que
// la memoria no crezca con cada IP distinta que llega.
func (l *IPRateLimiter) StartCleanup(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Minute
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				l.Cleanup()
			}
		}
	}()
}

// Middleware devuelve el handler de Gin que aplica el límite por IP de cliente
// (c.ClientIP()). Al excederse responde 429 Too Many Requests con el header
// Retry-After en segundos.
func (l *IPRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		allowed, retryAfter := l.allow(clientIP)
		if allowed {
			c.Next()
			return
		}

		seconds := int(math.Ceil(retryAfter.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
		log.Warn().
			Str("event", "rate_limited").
			Str("limiter", l.name).
			Str("client_ip", clientIP).
			Str("path", c.Request.URL.Path).
			Int("retry_after_s", seconds).
			Msg("Request rejected by rate limiter")

		c.Header("Retry-After", strconv.Itoa(seconds))
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
			"error":      fmt.Sprintf("Demasiadas solicitudes. Intenta nuevamente en %d segundos.", seconds),
			"retryAfter": seconds,
		})
	}
}
