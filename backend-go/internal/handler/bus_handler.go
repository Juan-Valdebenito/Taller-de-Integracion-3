package handler

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// Regex para formatos de placa patente chilena estándar:
// Formato moderno (4 letras, 2 números): ABCD-12 o ABCD12
// Formato clásico (2 letras, 4 números): AB-1234 o AB1234
var patenteRegexModern = regexp.MustCompile(`^[A-Z]{4}-?[0-9]{2}$`)
var patenteRegexClassic = regexp.MustCompile(`^[A-Z]{2}-?[0-9]{4}$`)

// IsValidPatente valida que la patente cumpla con los estándares chilenos de registro vehicular.
func IsValidPatente(patente string) bool {
	clean := strings.ToUpper(strings.TrimSpace(patente))
	return patenteRegexModern.MatchString(clean) || patenteRegexClassic.MatchString(clean)
}

// FormatPatente estandariza la patente al formato guionado XXXX-YY o XX-YYYY.
func FormatPatente(patente string) string {
	clean := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(patente), "-", ""))
	if len(clean) == 6 {
		if patenteRegexClassic.MatchString(clean) {
			return clean[:2] + "-" + clean[2:]
		}
		return clean[:4] + "-" + clean[4:]
	}
	return strings.ToUpper(strings.TrimSpace(patente))
}

// BusHandler maneja los endpoints de buses.
type BusHandler struct {
	busRepo *repository.BusRepository
}

func NewBusHandler(busRepo *repository.BusRepository) *BusHandler {
	return &BusHandler{busRepo: busRepo}
}

// GetAll godoc
// GET /api/v1/buses?line=7A&status=ACTIVE&routeId=xxx&companyId=yyy
func (h *BusHandler) GetAll(c *gin.Context) {
	var filter repository.BusFilter

	if line := c.Query("line"); line != "" {
		filter.Line = &line
	}
	if status := c.Query("status"); status != "" {
		st := domain.BusStatus(strings.ToUpper(status))
		filter.Status = &st
	}
	if routeID := c.Query("routeId"); routeID != "" {
		filter.RouteID = &routeID
	}
	if companyID := c.Query("companyId"); companyID != "" {
		filter.CompanyID = &companyID
	}

	buses, err := h.busRepo.FindAll(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener buses: " + err.Error()})
		return
	}
	if buses == nil {
		buses = []domain.Bus{}
	}
	c.JSON(http.StatusOK, buses)
}

// GetByID godoc
// GET /api/v1/buses/:id — detalle del bus con su aforo actual y ruta asociada
func (h *BusHandler) GetByID(c *gin.Context) {
	detail, err := h.busRepo.FindDetailByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus: " + err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// GetLocation godoc
// GET /api/v1/buses/:id/location — fallback REST para obtener última ubicación GPS
func (h *BusHandler) GetLocation(c *gin.Context) {
	bus, err := h.busRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener bus: " + err.Error()})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"busId":          bus.ID,
		"lastLatitude":   bus.LastLatitude,
		"lastLongitude":  bus.LastLongitude,
		"lastHeading":    bus.LastHeading,
		"lastSpeed":      bus.LastSpeed,
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
// POST /api/v1/buses — creación de nueva unidad con validación de patente y capacidad máxima por defecto de 35
func (h *BusHandler) Create(c *gin.Context) {
	var body struct {
		Patente   string  `json:"patente" binding:"required"`
		Capacity  int     `json:"capacity"`
		CompanyID string  `json:"companyId"`
		RouteID   *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: " + err.Error()})
		return
	}

	// 1. Validar formato de patente
	cleanPatente := strings.TrimSpace(body.Patente)
	if !IsValidPatente(cleanPatente) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Formato de patente vehicular inválido. Formatos aceptados: ABCD-12 o AB-1234",
		})
		return
	}
	formattedPatente := FormatPatente(cleanPatente)

	// 2. Capacidad máxima por defecto de 35 pasajeros
	if body.Capacity <= 0 {
		body.Capacity = 35
	}

	// 3. Empresa por defecto
	if body.CompanyID == "" {
		body.CompanyID = "comp-temuco-01"
	}

	bus, err := h.busRepo.Create(c.Request.Context(), formattedPatente, body.Capacity, body.CompanyID, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear unidad de bus: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, bus)
}

// Update godoc
// PUT /api/v1/buses/:id
func (h *BusHandler) Update(c *gin.Context) {
	var body struct {
		Patente  string  `json:"patente" binding:"required"`
		Capacity int     `json:"capacity" binding:"required,min=1"`
		Status   string  `json:"status" binding:"required"`
		RouteID  *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !IsValidPatente(body.Patente) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato de patente vehicular inválido"})
		return
	}
	formattedPatente := FormatPatente(body.Patente)

	status := domain.BusStatus(strings.ToUpper(body.Status))
	if !isValidOperationalStatus(status) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Estado operacional inválido. Valores permitidos: ACTIVE, MAINTENANCE, OUT_OF_SERVICE, INACTIVE",
		})
		return
	}

	bus, err := h.busRepo.Update(c.Request.Context(), c.Param("id"), formattedPatente, body.Capacity, status, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar bus: " + err.Error()})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

// Patch godoc
// PATCH /api/v1/buses/:id — actualización de estado operacional (ACTIVE, MAINTENANCE, OUT_OF_SERVICE) u otros campos
func (h *BusHandler) Patch(c *gin.Context) {
	var body struct {
		Patente  *string `json:"patente"`
		Capacity *int    `json:"capacity"`
		Status   *string `json:"status"`
		RouteID  *string `json:"routeId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Patente == nil && body.Capacity == nil && body.Status == nil && body.RouteID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debe especificar al menos un campo para actualizar"})
		return
	}

	var formattedPatente *string
	if body.Patente != nil {
		if !IsValidPatente(*body.Patente) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Formato de patente vehicular inválido"})
			return
		}
		f := FormatPatente(*body.Patente)
		formattedPatente = &f
	}

	var statusPtr *domain.BusStatus
	if body.Status != nil {
		s := domain.BusStatus(strings.ToUpper(*body.Status))
		if !isValidOperationalStatus(s) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Estado operacional inválido. Valores permitidos: ACTIVE, MAINTENANCE, OUT_OF_SERVICE, INACTIVE",
			})
			return
		}
		statusPtr = &s
	}

	bus, err := h.busRepo.UpdatePartial(c.Request.Context(), c.Param("id"), formattedPatente, body.Capacity, statusPtr, body.RouteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar parcialmente bus: " + err.Error()})
		return
	}
	if bus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bus no encontrado"})
		return
	}
	c.JSON(http.StatusOK, bus)
}

func isValidOperationalStatus(status domain.BusStatus) bool {
	switch status {
	case domain.BusStatusActive, domain.BusStatusMaintenance, domain.BusStatusOutOfService, domain.BusStatusInactive:
		return true
	default:
		return false
	}
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar bus: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Bus eliminado correctamente"})
}
