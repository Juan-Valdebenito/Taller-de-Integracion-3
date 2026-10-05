package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const requestIDHeader = "X-Request-ID"

// RequestLogger registra una entrada estructurada por cada request HTTP.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader(requestIDHeader)
		if requestID == "" {
			requestID = newRequestID()
		}
		c.Header(requestIDHeader, requestID)
		log.Debug().
			Str("event", "http_request_started").
			Str("request_id", requestID).
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Str("client_ip", c.ClientIP()).
			Msg("HTTP request started")

		started := time.Now()
		c.Next()

		status := c.Writer.Status()
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		event := log.Info()
		if status >= http.StatusBadRequest {
			event = log.Error()
		}

		event = addAuthenticatedUser(event, c)
		event.
			Str("event", "http_request").
			Str("request_id", requestID).
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", status).
			Int64("duration_ms", time.Since(started).Milliseconds()).
			Str("client_ip", c.ClientIP()).
			Msg("HTTP request completed")
	}
}

func addAuthenticatedUser(event *zerolog.Event, c *gin.Context) *zerolog.Event {
	if userID, ok := c.Get(ContextUserID); ok {
		if value, ok := userID.(string); ok && value != "" {
			event = event.Str("user_id", value)
		}
	}
	if userRole, ok := c.Get(ContextUserRole); ok {
		if value, ok := userRole.(string); ok && value != "" {
			event = event.Str("user_role", value)
		}
	}
	return event
}

func newRequestID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err == nil {
		return hex.EncodeToString(bytes[:])
	}
	return time.Now().UTC().Format("20060102150405.000000000")
}
