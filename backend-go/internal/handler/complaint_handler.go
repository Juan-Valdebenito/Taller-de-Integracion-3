package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// ComplaintHandler maneja los endpoints de reclamos.
type ComplaintHandler struct {
	complaintRepo *repository.ComplaintRepository
	busRepo       *repository.BusRepository
	routeRepo     *repository.RouteRepository
}

func NewComplaintHandler(
	complaintRepo *repository.ComplaintRepository,
	busRepo *repository.BusRepository,
	routeRepo *repository.RouteRepository,
) *ComplaintHandler {
	return &ComplaintHandler{complaintRepo: complaintRepo, busRepo: busRepo, routeRepo: routeRepo}
}

// emptyToNil normaliza "" (o solo espacios) a nil para los IDs opcionales.
func emptyToNil(s *string) *string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	v := strings.TrimSpace(*s)
	return &v
}

// GetAll godoc
// GET /api/v1/complaints
func (h *ComplaintHandler) GetAll(c *gin.Context) {
	filters := repository.ComplaintFilters{
		Status:   c.Query("status"),
		Category: c.Query("category"),
		BusID:    c.Query("busId"),
	}

	complaints, err := h.complaintRepo.FindAll(
		c.Request.Context(),
		filters,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Error al obtener reclamos",
		})
		return
	}

	if complaints == nil {
		complaints = []domain.Complaint{}
	}

	c.JSON(http.StatusOK, complaints)
}

// GetMine godoc
// GET /api/v1/complaints/my — reclamos del pasajero autenticado
func (h *ComplaintHandler) GetMine(c *gin.Context) {
	passengerID, _ := c.Get(middleware.ContextUserID)

	filters := repository.ComplaintFilters{
		Status:      c.Query("status"),
		Category:    c.Query("category"),
		BusID:       c.Query("busId"),
		PassengerID: passengerID.(string),
	}

	complaints, err := h.complaintRepo.FindAll(c.Request.Context(), filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamos"})
		return
	}

	if complaints == nil {
		complaints = []domain.Complaint{}
	}

	c.JSON(http.StatusOK, complaints)
}

// GetByID godoc
// GET /api/v1/complaints/:id
func (h *ComplaintHandler) GetByID(c *gin.Context) {
	complaint, err := h.complaintRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamo"})
		return
	}
	if complaint == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
		return
	}
	c.JSON(http.StatusOK, complaint)
}

// Create godoc
// POST /api/v1/complaints — solo pasajeros autenticados
// Body: title, description, category (requeridos); busId, routeId (opcionales,
// pero al menos uno). La empresa responsable se deriva del bus o de la ruta.
func (h *ComplaintHandler) Create(c *gin.Context) {
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Category    string  `json:"category"`
		BusID       *string `json:"busId"`
		RouteID     *string `json:"routeId"`
		TripID      *string `json:"tripId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo de la solicitud inválido"})
		return
	}

	title := strings.TrimSpace(body.Title)
	description := strings.TrimSpace(body.Description)
	category := domain.ComplaintCategory(body.Category)
	busID, routeID, tripID := emptyToNil(body.BusID), emptyToNil(body.RouteID), emptyToNil(body.TripID)

	if title == "" || description == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El título y la descripción son obligatorios"})
		return
	}
	if !category.IsValid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Categoría inválida"})
		return
	}
	if busID == nil && routeID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debe indicar un bus o una ruta para identificar a la empresa responsable"})
		return
	}

	ctx := c.Request.Context()
	var companyID string

	if busID != nil {
		bus, err := h.busRepo.FindByID(ctx, *busID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo"})
			return
		}
		if bus == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El bus indicado no existe"})
			return
		}
		companyID = bus.CompanyID
	}

	if routeID != nil {
		route, err := h.routeRepo.FindByID(ctx, *routeID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo"})
			return
		}
		if route == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "La ruta indicada no existe"})
			return
		}
		if companyID != "" && companyID != route.CompanyID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El bus y la ruta pertenecen a empresas distintas"})
			return
		}
		companyID = route.CompanyID
	}

	// El pasajero es el usuario autenticado
	passengerID, _ := c.Get(middleware.ContextUserID)

	complaint, err := h.complaintRepo.Create(
		ctx,
		title,
		description,
		category,
		passengerID.(string),
		companyID,
		busID,
		routeID,
		tripID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo"})
		return
	}
	c.JSON(http.StatusCreated, complaint)
}

func (h *ComplaintHandler) FindByPassengerID(c *gin.Context) {
	// 1. Obtener el ID del pasajero desde el contexto (inyectado por el middleware Auth)
	passengerID, exists := c.Get(middleware.ContextUserID)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no autenticado"})
		return
	}

	// 2. Consultar la base de datos a través del repositorio/servicio
	filters := repository.ComplaintFilters{
		Status:   c.Query("status"),
		Category: c.Query("category"),
		BusID:    c.Query("busId"),
	}

	complaints, err := h.complaintRepo.FindByPassengerID(
		c.Request.Context(),
		passengerID.(string),
		filters,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamos"})
		return
	}

	// 3. Responder con la lista de reclamos del usuario
	c.JSON(http.StatusOK, complaints)
}

// UpdateStatus godoc
// PUT /api/v1/complaints/:id/status — empresa o admin
func (h *ComplaintHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status        string  `json:"status" binding:"required"`
		AdminResponse *string `json:"adminResponse"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	complaint, err := h.complaintRepo.UpdateStatus(
		c.Request.Context(),
		c.Param("id"),
		domain.ComplaintStatus(body.Status),
		body.AdminResponse,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar estado del reclamo"})
		return
	}
	if complaint == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
		return
	}
	c.JSON(http.StatusOK, complaint)
}

// Delete godoc
// DELETE /api/v1/complaints/:id — admin
func (h *ComplaintHandler) Delete(c *gin.Context) {
	err := h.complaintRepo.Delete(c.Request.Context(), c.Param("id"))
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar reclamo"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Reclamo eliminado correctamente"})
}
