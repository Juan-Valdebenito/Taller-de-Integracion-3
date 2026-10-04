package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// ComplaintHandler maneja los endpoints de reclamos.
type ComplaintHandler struct {
	complaintRepo    *repository.ComplaintRepository
	complaintService *service.ComplaintService
}

func NewComplaintHandler(complaintRepo *repository.ComplaintRepository) *ComplaintHandler {
	return &ComplaintHandler{
		complaintRepo:    complaintRepo,
		complaintService: service.NewComplaintService(),
	}
}

// GetStats godoc
// GET /api/v1/complaints/stats — resumen analítico para el dashboard administrativo
func (h *ComplaintHandler) GetStats(c *gin.Context) {
	var compIDPtr *string
	if comp := c.Query("companyId"); comp != "" {
		compIDPtr = &comp
	}

	stats, err := h.complaintRepo.GetStats(c.Request.Context(), compIDPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al calcular estadísticas de reclamos: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GetAll godoc
// GET /api/v1/complaints
// Soporta filtros: status, category, lineName, busId, companyId, rating, minRating, maxRating, page, limit
func (h *ComplaintHandler) GetAll(c *gin.Context) {
	var filter repository.ComplaintFilter

	if s := c.Query("status"); s != "" {
		st := domain.ComplaintStatus(s)
		filter.Status = &st
	}
	if cat := c.Query("category"); cat != "" {
		ct := domain.ComplaintCategory(cat)
		filter.Category = &ct
	}
	if b := c.Query("busId"); b != "" {
		filter.BusID = &b
	}
	if l := c.Query("lineName"); l != "" {
		filter.LineName = &l
	}
	if comp := c.Query("companyId"); comp != "" {
		filter.CompanyID = &comp
	}
	if r := c.Query("rating"); r != "" {
		if val, err := strconv.Atoi(r); err == nil {
			filter.Rating = &val
		}
	}
	if minR := c.Query("minRating"); minR != "" {
		if val, err := strconv.Atoi(minR); err == nil {
			filter.MinRating = &val
		}
	}
	if maxR := c.Query("maxRating"); maxR != "" {
		if val, err := strconv.Atoi(maxR); err == nil {
			filter.MaxRating = &val
		}
	}

	var pagination []repository.Pagination
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit > 0 {
		if page < 1 {
			page = 1
		}
		pagination = append(pagination, repository.Pagination{Page: page, Limit: limit})
	}

	complaints, err := h.complaintRepo.FindAll(c.Request.Context(), filter, pagination...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener reclamos: " + err.Error()})
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
// POST /api/v1/complaints — pasajeros autenticados o reporte contextual
func (h *ComplaintHandler) Create(c *gin.Context) {
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Category    string  `json:"category"`
		Rating      *int    `json:"rating"`
		LineName    *string `json:"lineName"`
		CompanyID   string  `json:"companyId"`
		BusID       *string `json:"busId"`
		RouteID     *string `json:"routeId"`
		TripID      *string `json:"tripId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Title == "" {
		body.Title = "Reporte de Servicio"
	}
	if body.Description == "" {
		body.Description = "Sin comentarios adicionales"
	}
	if body.Category == "" {
		body.Category = "OTHER"
	}
	if body.CompanyID == "" {
		body.CompanyID = "comp-temuco-01"
	}

	if body.Rating != nil {
		if *body.Rating < 1 || *body.Rating > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El rating debe ser un número entero entre 1 y 5"})
			return
		}
	}

	// El pasajero es el usuario autenticado (o usuario demo por defecto)
	passengerID := "usr-pass-01"
	if uID, exists := c.Get(middleware.ContextUserID); exists {
		if str, ok := uID.(string); ok && str != "" {
			passengerID = str
		}
	}

	complaint, err := h.complaintRepo.Create(
		c.Request.Context(),
		body.Title,
		body.Description,
		domain.ComplaintCategory(body.Category),
		body.Rating,
		body.LineName,
		passengerID,
		body.CompanyID,
		body.BusID,
		body.RouteID,
		body.TripID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, complaint)
}

// UpdateStatus godoc
// PATCH /api/v1/complaints/:id/status — empresa o admin
func (h *ComplaintHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status        string  `json:"status" binding:"required"`
		AdminResponse *string `json:"adminResponse"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newStatus := domain.ComplaintStatus(body.Status)
	if !h.complaintService.IsValidStatus(newStatus) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado de destino no válido. Estados permitidos: PENDING, IN_REVIEW, RESOLVED, REJECTED"})
		return
	}

	existing, err := h.complaintRepo.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar reclamo"})
		return
	}
	if existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reclamo no encontrado"})
		return
	}

	if err := h.complaintService.ValidateTransition(existing.Status, newStatus); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	complaint, err := h.complaintRepo.UpdateStatus(
		c.Request.Context(),
		c.Param("id"),
		newStatus,
		body.AdminResponse,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar estado del reclamo"})
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
