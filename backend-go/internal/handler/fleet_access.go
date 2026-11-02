package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Quién puede tocar micros y rutas:
//   - ADMIN: todas.
//   - COMPANY: solo las de su empresa. Al crear una micro se usa siempre su
//     empresa (se ignora el companyId que mande el cliente) y solo puede
//     asignarle rutas de su empresa. Una micro o ruta ajena responde 404.

// routeFinder busca rutas (lo implementa repository.RouteRepository).
type routeFinder interface {
	FindByID(ctx context.Context, id string) (*domain.Route, error)
}

// WithAccess conecta lo necesario para aplicar los permisos por empresa.
func (h *BusHandler) WithAccess(users userFinder, routes routeFinder) *BusHandler {
	h.users = users
	h.routes = routes
	return h
}

// WithUsers conecta el repositorio de usuarios (para la empresa de una cuenta COMPANY).
func (h *RouteHandler) WithUsers(users userFinder) *RouteHandler {
	h.users = users
	return h
}

// belongsToActor indica si algo de la empresa companyID se puede modificar.
func belongsToActor(actor requestActor, companyID string) bool {
	if actor.isCompany() {
		return companyID != "" && companyID == actor.companyID
	}
	return actor.role == string(domain.UserRoleAdmin)
}

// checkRouteForCompany responde 400 y devuelve false si la ruta pedida no
// existe o no es de la empresa de la micro. Sin ruta (nil o vacía) no hay nada
// que revisar.
func checkRouteForCompany(c *gin.Context, routes routeFinder, routeID *string, companyID string) bool {
	if routeID == nil || strings.TrimSpace(*routeID) == "" {
		return true
	}
	if routes == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "No se pudo verificar la ruta"})
		return false
	}
	route, err := routes.FindByID(c.Request.Context(), strings.TrimSpace(*routeID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar la ruta"})
		return false
	}
	if route == nil || route.CompanyID != companyID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La ruta no existe o no pertenece a la empresa de la micro"})
		return false
	}
	return true
}
