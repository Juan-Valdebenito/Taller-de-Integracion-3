package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

// companyStore: lo que el handler necesita del repositorio (los tests usan uno falso).
type companyStore interface {
	FindAll(ctx context.Context) ([]domain.Company, error)
	FindByID(ctx context.Context, id string) (*domain.Company, error)
	Create(ctx context.Context, in domain.CompanyInput) (*domain.Company, error)
	Update(ctx context.Context, id string, in domain.CompanyInput) (*domain.Company, error)
	SetActive(ctx context.Context, id string, active bool) (*domain.Company, error)
}

// CompanyHandler: empresas de transporte. Todas las rutas son solo para ADMIN
// (lo exige el router).
type CompanyHandler struct {
	companies companyStore
}

func NewCompanyHandler(companyRepo *repository.CompanyRepository) *CompanyHandler {
	return &CompanyHandler{companies: companyRepo}
}

// companyBody: datos que llegan al crear o editar.
type companyBody struct {
	Name    string  `json:"name"`
	Rut     string  `json:"rut"`
	Email   string  `json:"email"`
	Phone   *string `json:"phone"`
	Address *string `json:"address"`
}

func (b companyBody) input() domain.CompanyInput {
	return domain.CompanyInput{Name: b.Name, Rut: b.Rut, Email: b.Email, Phone: b.Phone, Address: b.Address}
}

// respondCompanyError: 400 si los datos no son válidos, 409 si el RUT o el
// correo ya existen, 500 en otro caso (sin detalles internos).
func respondCompanyError(c *gin.Context, err error) {
	switch {
	case domain.IsCompanyValidationError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, repository.ErrCompanyDuplicateRut), errors.Is(err, repository.ErrCompanyDuplicateEmail):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar la empresa"})
	}
}

// GetAll godoc
// GET /api/v1/companies — todas las empresas con sus datos.
// Con ?active=true solo las activas (como respondía antes).
func (h *CompanyHandler) GetAll(c *gin.Context) {
	companies, err := h.companies.FindAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener empresas"})
		return
	}
	if c.Query("active") == "true" {
		active := make([]domain.Company, 0, len(companies))
		for _, company := range companies {
			if company.IsActive {
				active = append(active, company)
			}
		}
		companies = active
	}
	c.JSON(http.StatusOK, companies)
}

// GetByID godoc
// GET /api/v1/companies/:id
func (h *CompanyHandler) GetByID(c *gin.Context) {
	company, err := h.companies.FindByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener la empresa"})
		return
	}
	if company == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Empresa no encontrada"})
		return
	}
	c.JSON(http.StatusOK, company)
}

// Create godoc
// POST /api/v1/companies — registra una empresa (queda activa).
func (h *CompanyHandler) Create(c *gin.Context) {
	var body companyBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo de la solicitud inválido"})
		return
	}
	in, err := body.input().Normalize()
	if err != nil {
		respondCompanyError(c, err)
		return
	}
	company, err := h.companies.Create(c.Request.Context(), in)
	if err != nil {
		respondCompanyError(c, err)
		return
	}
	c.JSON(http.StatusCreated, company)
}

// Update godoc
// PUT /api/v1/companies/:id — reemplaza nombre, RUT, correo, teléfono y dirección.
func (h *CompanyHandler) Update(c *gin.Context) {
	var body companyBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cuerpo de la solicitud inválido"})
		return
	}
	in, err := body.input().Normalize()
	if err != nil {
		respondCompanyError(c, err)
		return
	}
	company, err := h.companies.Update(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		respondCompanyError(c, err)
		return
	}
	if company == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Empresa no encontrada"})
		return
	}
	c.JSON(http.StatusOK, company)
}

// SetStatus godoc
// PATCH /api/v1/companies/:id/status — {"isActive": true|false}.
func (h *CompanyHandler) SetStatus(c *gin.Context) {
	var body struct {
		IsActive *bool `json:"isActive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.IsActive == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": `Falta el campo "isActive" (true o false)`})
		return
	}
	company, err := h.companies.SetActive(c.Request.Context(), c.Param("id"), *body.IsActive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al cambiar el estado de la empresa"})
		return
	}
	if company == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Empresa no encontrada"})
		return
	}
	c.JSON(http.StatusOK, company)
}
