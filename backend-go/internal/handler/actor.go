package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// userFinder busca la cuenta con sesión para conocer su empresa.
type userFinder interface {
	FindByID(ctx context.Context, id string) (*domain.User, error)
}

// requestActor es quien hace la petición, con su empresa si es COMPANY.
type requestActor struct {
	userID    string
	role      string
	companyID string
}

// resolveActor arma el actor de la petición; para una cuenta COMPANY busca su
// empresa en la base (el token no la trae). Responde el error y devuelve
// false si no se pudo (cuenta de empresa sin empresa o sin acceso a la base).
func resolveActor(c *gin.Context, users userFinder) (requestActor, bool) {
	userID, _ := c.Get(middleware.ContextUserID)
	role, _ := c.Get(middleware.ContextUserRole)
	actor := requestActor{}
	actor.userID, _ = userID.(string)
	actor.role, _ = role.(string)
	if actor.role != string(domain.UserRoleCompany) {
		return actor, true
	}
	if users == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "No se pudo verificar la empresa de tu cuenta"})
		return actor, false
	}
	user, err := users.FindByID(c.Request.Context(), actor.userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar la empresa de tu cuenta"})
		return actor, false
	}
	if user == nil || user.CompanyID == nil || strings.TrimSpace(*user.CompanyID) == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Tu cuenta no tiene una empresa asignada. Pídele a un administrador que te la asigne."})
		return actor, false
	}
	actor.companyID = *user.CompanyID
	return actor, true
}

// isCompany indica si el actor es una cuenta de empresa.
func (a requestActor) isCompany() bool { return a.role == string(domain.UserRoleCompany) }
