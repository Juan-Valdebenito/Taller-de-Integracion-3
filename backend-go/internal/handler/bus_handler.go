package handler

import (
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// BusHandler maneja los endpoints de buses.
type BusHandler struct {
	busRepo *repository.BusRepository
}

func NewBusHandler(busRepo *repository.BusRepository) *BusHandler {
	return &BusHandler{busRepo: busRepo}
}

// GetAll godoc
// GET /api/v1/buses?routeId=xxx
func (h *BusHandler) GetAll(c *gin.Context) {
	routeID := c.Query("routeId")
	buses, err := h.busRepo.FindAll(c.Request.Context(), routeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener buses"})
		return
	}
	if buses == nil {
		buses = []domain.Bus{}
	}
	c.JSON(http.StatusOK, buses)
}

// GetByID godoc
// GET /api/v1/buses/:id
func (h *BusHandler) GetByID(c *gin.Context) {
	bus, err := h.busRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

// GetLocation godoc
// GET /api/v1/buses/:id/location — fallback REST para obtener última ubicación GPS
func (h *BusHandler) GetLocation(c *gin.Context) {
	bus, err := h.busRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"busId":         bus.ID,
		"lastLatitude":  bus.LastLatitude,
		"lastLongitude": bus.LastLongitude,
		"lastHeading":   bus.LastHeading,
		"lastSpeed":     bus.LastSpeed,
		"lastLocationAt": bus.LastLocationAt,
	})
}

// simulationLastEvent describe el último evento inyectado sobre un bus,
// en el mismo formato que ya renderiza el panel de DevTools del frontend.
type simulationLastEvent struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	Timestamp   string `json:"timestamp"`
}

// SimulateEvent godoc
// POST /api/v1/buses/simulate-event — público, fallback REST para el panel
// de DevTools cuando el socket de tiempo real no está disponible.
// Aplica el mismo catálogo de eventos que el simulador de sensores/pagos
// (tap_in_normal, tap_in_student, sensor_alight, fill_capacity, empty_capacity)
// pero contra el bus real en la base de datos, respetando su capacidad.
func (h *BusHandler) SimulateEvent(c *gin.Context) {
	var body struct {
		BusID     string `json:"busId" binding:"required"`
		EventType string `json:"eventType" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bus, err := h.busRepo.FindByID(c.Request.Context(), body.BusID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener el bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Microbús %s no encontrado", body.BusID)})
		return
	}

	now := time.Now().Format("15:04:05")
	passengers := bus.CurrentPassengers
	boardings := bus.Boardings
	schoolBoardings := bus.SchoolBoardings
	alightings := bus.Alightings
	var evt simulationLastEvent

	switch body.EventType {
	case "tap_in_normal":
		if passengers < bus.Capacity {
			passengers++
			boardings++
			evt = simulationLastEvent{"CARD_TAP_NORMAL", "💳 Validación Bip Normal ($700 CLP) - Puerta delantera", now}
		} else {
			evt = simulationLastEvent{"OVERCROWD_REJECTED", fmt.Sprintf("⚠️ Intento de ingreso RECHAZADO: Capacidad máxima (%d) alcanzada", bus.Capacity), now}
		}

	case "tap_in_student":
		if passengers < bus.Capacity {
			passengers++
			schoolBoardings++
			evt = simulationLastEvent{"CARD_TAP_STUDENT", "🎓 Validación Pase Escolar TNE ($240 CLP) - Puerta delantera", now}
		} else {
			evt = simulationLastEvent{"OVERCROWD_REJECTED", fmt.Sprintf("⚠️ Intento de ingreso RECHAZADO: Capacidad máxima (%d) alcanzada", bus.Capacity), now}
		}

	case "sensor_alight":
		if passengers > 0 {
			passengers--
			alightings++
			evt = simulationLastEvent{"CAMERA_ALIGHT_DETECTED", "📷 Sensor Cámara: Descenso detectado en puerta trasera (-1)", now}
		} else {
			evt = simulationLastEvent{"SENSOR_IDLE", "ℹ️ Sensor Cámara: No hay pasajeros a bordo para descender", now}
		}

	case "fill_capacity":
		if delta := bus.Capacity - passengers; delta > 0 {
			boardings += delta
		}
		passengers = bus.Capacity
		evt = simulationLastEvent{"FORCE_FILL", fmt.Sprintf("⚡ Simulación DevTools: Aforo llevado al límite (%d pasajeros)", bus.Capacity), now}

	case "empty_capacity":
		alightings += passengers
		passengers = 0
		evt = simulationLastEvent{"FORCE_EMPTY", "🧹 Simulación DevTools: Bus vaciado (0 pasajeros)", now}

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "eventType inválido"})
		return
	}

	updated, err := h.busRepo.UpdateOccupancyCounters(c.Request.Context(), bus.ID, passengers, boardings, schoolBoardings, alightings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar el bus"})
		return
	}
	if updated == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Microbús %s no encontrado", body.BusID)})
		return
	}

	occupancyPercentage := 0.0
	if updated.Capacity > 0 {
		occupancyPercentage = math.Round((float64(updated.CurrentPassengers)/float64(updated.Capacity))*1000) / 10
	}

	c.JSON(http.StatusOK, gin.H{
		"message":             fmt.Sprintf("Evento %s procesado con éxito", body.EventType),
		"bus":                 updated,
		"occupancyPercentage": occupancyPercentage,
		"isFull":              updated.CurrentPassengers >= updated.Capacity,
		"lastEvent":           evt,
	})
}

// Create godoc
// POST /api/v1/buses
func (h *BusHandler) Create(c *gin.Context) {
	var body struct {
		Patente   string  `json:"patente" binding:"required"`
		Capacity  int     `json:"capacity" binding:"required,min=1"`
		CompanyID string  `json:"companyId" binding:"required"`
		RouteID   *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bus, err := h.busRepo.Create(c.Request.Context(), body.Patente, body.Capacity, body.CompanyID, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear bus"})
		return
	}
	c.JSON(http.StatusCreated, bus)
}

// Update godoc
// PUT /api/v1/buses/:id
func (h *BusHandler) Update(c *gin.Context) {
	var body struct {
		Patente  string `json:"patente" binding:"required"`
		Capacity int    `json:"capacity" binding:"required,min=1"`
		Status   string `json:"status" binding:"required"`
		RouteID  *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bus, err := h.busRepo.Update(c.Request.Context(), c.Param("id"), body.Patente, body.Capacity, domain.BusStatus(body.Status), body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar bus"})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

// Delete godoc
// DELETE /api/v1/buses/:id
func (h *BusHandler) Delete(c *gin.Context) {
	err := h.busRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar bus"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Bus eliminado correctamente"})
}
