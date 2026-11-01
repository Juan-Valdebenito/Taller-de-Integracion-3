package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/middleware"
)

// Quién puede ver y responder reclamos:
//   - ADMIN: todos.
//   - COMPANY: solo los de su empresa. La empresa se lee de la base (el token
//     no la trae) y se ignora el companyId que mande el cliente.
//   - PASSENGER: solo el detalle de sus propios reclamos.

// userFinder busca la cuenta con sesión para conocer su empresa.
type userFinder interface {
	FindByID(ctx context.Context, id string) (*domain.User, error)
}

// WithUsers conecta el repositorio de usuarios (para la empresa de una cuenta COMPANY).
func (h *ComplaintHandler) WithUsers(users userFinder) *ComplaintHandler {
	h.users = users
	return h
}

// complaintActor es quien hace la petición, con su empresa si es COMPANY.
type complaintActor struct {
	userID    string
	role      string
	companyID string
}

// actorForComplaints arma el actor de la petición. Responde el error y
// devuelve false si no se pudo (cuenta de empresa sin empresa o sin acceso a la base).
func (h *ComplaintHandler) actorForComplaints(c *gin.Context) (complaintActor, bool) {
	userID, _ := c.Get(middleware.ContextUserID)
	role, _ := c.Get(middleware.ContextUserRole)
	actor := complaintActor{}
	actor.userID, _ = userID.(string)
	actor.role, _ = role.(string)
	if actor.role != string(domain.UserRoleCompany) {
		return actor, true
	}
	if h.users == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "No se pudo verificar la empresa de tu cuenta"})
		return actor, false
	}
	user, err := h.users.FindByID(c.Request.Context(), actor.userID)
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

// companyScope devuelve la empresa a la que se limita una consulta de lista o
// cifras: la pedida (o todas, nil) para ADMIN, y siempre la propia para COMPANY.
func companyScope(actor complaintActor, requested string) *string {
	if actor.role == string(domain.UserRoleCompany) {
		id := actor.companyID
		return &id
	}
	if requested = strings.TrimSpace(requested); requested != "" {
		return &requested
	}
	return nil
}

// canViewComplaint indica si el actor puede ver el reclamo.
func canViewComplaint(actor complaintActor, complaint *domain.Complaint) bool {
	switch actor.role {
	case string(domain.UserRoleAdmin):
		return true
	case string(domain.UserRoleCompany):
		return complaint.CompanyID != nil && *complaint.CompanyID == actor.companyID
	case string(domain.UserRolePassenger):
		return complaint.PassengerID != nil && *complaint.PassengerID == actor.userID
	}
	return false
}

// canRespondComplaint indica si el actor puede cambiar el estado o responder:
// el administrador cualquiera, la empresa solo los suyos.
func canRespondComplaint(actor complaintActor, complaint *domain.Complaint) bool {
	if actor.role == string(domain.UserRolePassenger) {
		return false
	}
	return canViewComplaint(actor, complaint)
}
