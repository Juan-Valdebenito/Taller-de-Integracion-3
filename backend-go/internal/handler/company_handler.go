package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/repository"
)

type CompanyHandler struct {
	companyRepo *repository.CompanyRepository
}

func NewCompanyHandler(companyRepo *repository.CompanyRepository) *CompanyHandler {
	return &CompanyHandler{companyRepo: companyRepo,}
}

// GetAll godoc
// GET /api/v1/companies
func (h *CompanyHandler) GetAll(c *gin.Context) {
	companies, err := h.companyRepo.FindAllActive(c.Request.Context(),)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener empresas"},)
		return
	}
	c.JSON(http.StatusOK, companies)
}