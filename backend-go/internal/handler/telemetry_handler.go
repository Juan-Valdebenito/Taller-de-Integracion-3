package handler

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/telemetry"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
)

// publishAuthorizer lo implementa websocket.RepoAuthorizer: la misma regla
// que al publicar por el WebSocket (una empresa, solo sus micros y rutas).
type publishAuthorizer interface {
	CanPublish(ctx context.Context, userID, role, busID, routeID string) string
}

type busFinder interface {
	FindByID(ctx context.Context, id string) (*domain.Bus, error)
}

// livePublisher lo implementa websocket.Hub (el mapa de los pasajeros).
type livePublisher interface {
	PublishInternal(data ws.BusLocationData)
}

// telemetryForwarder lo implementa telemetry.Forwarder (envía en segundo plano).
type telemetryForwarder interface {
	Forward(reading telemetry.GPSReading)
}

// TelemetryHandler recibe el GPS del modo conductor por HTTP. Lo usa la app
// cuando corre en segundo plano (ahí el WebSocket no es confiable): publica la
// posición en el mapa en vivo y la reenvía a micro_telemetry.
type TelemetryHandler struct {
	authz     publishAuthorizer
	buses     busFinder
	routes    routeFinder
	live      livePublisher
	forwarder telemetryForwarder
	now       func() time.Time
}

func NewTelemetryHandler(authz publishAuthorizer, buses busFinder, routes routeFinder, live livePublisher, forwarder telemetryForwarder) *TelemetryHandler {
	return &TelemetryHandler{authz: authz, buses: buses, routes: routes, live: live, forwarder: forwarder, now: time.Now}
}

// gpsRequest es lo que manda la app (mismos nombres que al publicar por el WebSocket).
type gpsRequest struct {
	BusID     string   `json:"busId"`
	RouteID   string   `json:"routeId"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	Heading   float64  `json:"heading"`
	Speed     float64  `json:"speed"` // km/h
	// Timestamp de la lectura (RFC 3339). Las lecturas en segundo plano
	// pueden llegar algo atrasadas; si falta, se usa la hora del servidor.
	Timestamp *time.Time `json:"timestamp"`
}

const (
	// liveMaxAge: una lectura más vieja que esto no mueve la micro en el mapa
	// (ya no es su posición actual), pero igual va al histórico.
	liveMaxAge = 2 * time.Minute
	// maxReadingAge: lecturas más viejas se descartan.
	maxReadingAge = time.Hour
	// maxClockSkew: tolerancia para relojes de teléfono adelantados.
	maxClockSkew = 5 * time.Minute
)

// validateGPS revisa la lectura y la normaliza (rumbo en [0, 360)). Devuelve
// el motivo del rechazo, o "".
func validateGPS(req *gpsRequest, now time.Time) string {
	req.BusID, req.RouteID = strings.TrimSpace(req.BusID), strings.TrimSpace(req.RouteID)
	if req.BusID == "" || req.RouteID == "" {
		return "busId y routeId son obligatorios"
	}
	if req.Latitude == nil || req.Longitude == nil || *req.Latitude < -90 || *req.Latitude > 90 || *req.Longitude < -180 || *req.Longitude > 180 {
		return "Coordenadas inválidas"
	}
	if math.IsNaN(req.Heading) || math.IsInf(req.Heading, 0) || math.IsNaN(req.Speed) || req.Speed < 0 || req.Speed > 300 {
		return "Rumbo o velocidad inválidos"
	}
	req.Heading = math.Mod(math.Mod(req.Heading, 360)+360, 360)
	if req.Timestamp == nil {
		t := now
		req.Timestamp = &t
	}
	if req.Timestamp.After(now.Add(maxClockSkew)) || req.Timestamp.Before(now.Add(-maxReadingAge)) {
		return "La hora de la lectura no es válida"
	}
	return ""
}

// ReportGPS godoc
// POST /api/v1/telemetry/gps — posición del conductor (COMPANY o ADMIN).
// Responde 202: la posición se publica en el mapa (si es reciente) y se
// reenvía a micro_telemetry en segundo plano.
func (h *TelemetryHandler) ReportGPS(c *gin.Context) {
	var req gpsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato JSON inválido"})
		return
	}
	now := h.now().UTC()
	if problem := validateGPS(&req, now); problem != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": problem})
		return
	}

	userID, _ := c.Get(middleware.ContextUserID)
	role, _ := c.Get(middleware.ContextUserRole)
	uid, _ := userID.(string)
	r, _ := role.(string)
	if problem := h.authz.CanPublish(c.Request.Context(), uid, r, req.BusID, req.RouteID); problem != "" {
		c.JSON(http.StatusForbidden, gin.H{"error": problem})
		return
	}

	bus, err := h.buses.FindByID(c.Request.Context(), req.BusID)
	if err != nil || bus == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer la micro"})
		return
	}
	route, err := h.routes.FindByID(c.Request.Context(), req.RouteID)
	if err != nil || route == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer la ruta"})
		return
	}

	live := now.Sub(req.Timestamp.UTC()) <= liveMaxAge
	if live && h.live != nil {
		h.live.PublishInternal(ws.BusLocationData{
			BusID:             bus.ID,
			RouteID:           route.ID,
			Latitude:          *req.Latitude,
			Longitude:         *req.Longitude,
			Heading:           req.Heading,
			Speed:             req.Speed,
			CurrentPassengers: bus.CurrentPassengers,
			Capacity:          bus.Capacity,
		})
	}

	forwarded := h.forwarder != nil
	if forwarded {
		// Ids que se mandan a micro_telemetry: el id de la micro en backend-go y
		// el código de la ruta (ej. "7B"), como en sus ejemplos.
		h.forwarder.Forward(telemetry.GPSReading{
			EventID:   fmt.Sprintf("gps-%s-%d", bus.ID, req.Timestamp.UnixMilli()),
			BusID:     bus.ID,
			RouteID:   route.Code,
			Latitude:  *req.Latitude,
			Longitude: *req.Longitude,
			Heading:   req.Heading,
			SpeedKMH:  req.Speed,
			Timestamp: req.Timestamp.UTC(),
		})
	}
	c.JSON(http.StatusAccepted, gin.H{"live": live, "telemetry": forwarded})
}
