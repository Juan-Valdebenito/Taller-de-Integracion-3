package handler

import (
	"net/http"
	"strconv"
	"strings"

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
	busRepo          *repository.BusRepository
	routeRepo        *repository.RouteRepository
}

func NewComplaintHandler(
	complaintRepo *repository.ComplaintRepository,
	busRepo *repository.BusRepository,
	routeRepo *repository.RouteRepository,
) *ComplaintHandler {
	return &ComplaintHandler{
		complaintRepo:    complaintRepo,
		complaintService: service.NewComplaintService(),
		busRepo:          busRepo,
		routeRepo:        routeRepo,
	}
}

// emptyToNil normaliza "" (o solo espacios) a nil para los IDs opcionales.
func emptyToNil(s *string) *string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	v := strings.TrimSpace(*s)
	return &v
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
	if p := c.Query("passengerId"); p != "" {
		filter.PassengerID = &p
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

// GetMine godoc
// GET /api/v1/complaints/my — reclamos del pasajero autenticado
func (h *ComplaintHandler) GetMine(c *gin.Context) {
	passengerID, exists := c.Get(middleware.ContextUserID)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no autenticado"})
		return
	}

	pidStr := passengerID.(string)
	filter := repository.ComplaintFilter{
		PassengerID: &pidStr,
	}
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

	complaints, err := h.complaintRepo.FindAll(c.Request.Context(), filter)
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
// POST /api/v1/complaints — creación de reclamo contextual
func (h *ComplaintHandler) Create(c *gin.Context) {
	var body struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Comment     string  `json:"comment"`
		Category    string  `json:"category"`
		Rating      *int    `json:"rating"`
		LineName    *string `json:"lineName"`
		CompanyID   string  `json:"companyId"`
		BusID       *string `json:"busId"`
		RouteID     *string `json:"routeId"`
		TripID      *string `json:"tripId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo de la solicitud inválido"})
		return
	}

	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "Reporte de Servicio"
	}

	description := strings.TrimSpace(body.Description)
	if description == "" && body.Comment != "" {
		description = strings.TrimSpace(body.Comment)
	}
	if description == "" {
		description = "Sin comentarios adicionales"
	}

	category := domain.ComplaintCategory(strings.TrimSpace(body.Category))
	if category == "" {
		category = domain.ComplaintCategoryOther
	}

	busID, routeID, tripID := emptyToNil(body.BusID), emptyToNil(body.RouteID), emptyToNil(body.TripID)

	ctx := c.Request.Context()
	companyID := strings.TrimSpace(body.CompanyID)

	if busID != nil && h.busRepo != nil {
		bus, err := h.busRepo.FindByID(ctx, *busID)
		if err == nil && bus != nil {
			if companyID == "" {
				companyID = bus.CompanyID
			}
			if routeID == nil {
				routeID = bus.RouteID
			}
		}
	}

	if routeID != nil && h.routeRepo != nil {
		route, err := h.routeRepo.FindByID(ctx, *routeID)
		if err == nil && route != nil {
			if companyID == "" {
				companyID = route.CompanyID
			}
			if body.LineName == nil || *body.LineName == "" {
				body.LineName = &route.Name
			}
		}
	}

	if companyID == "" {
		companyID = "comp-temuco-01"
	}

	if body.Rating != nil {
		if *body.Rating < 1 || *body.Rating > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El rating debe ser un número entero entre 1 y 5"})
			return
		}
	}

	passengerID := "usr-pass-01"
	if uID, exists := c.Get(middleware.ContextUserID); exists {
		if str, ok := uID.(string); ok && str != "" {
			passengerID = str
		}
	}

	complaint, err := h.complaintRepo.Create(
		ctx,
		title,
		description,
		category,
		body.Rating,
		body.LineName,
		passengerID,
		companyID,
		busID,
		routeID,
		tripID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear reclamo: " + err.Error()})
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
