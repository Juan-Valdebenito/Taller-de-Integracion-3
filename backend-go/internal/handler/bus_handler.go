package handler

import (
	"net/http"
	"regexp"
	"strings"

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
