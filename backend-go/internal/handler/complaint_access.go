package handler

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// Quién puede ver y responder reclamos:
//   - ADMIN: todos.
//   - COMPANY: solo los de su empresa. La empresa se lee de la base (el token
//     no la trae) y se ignora el companyId que mande el cliente.
//   - PASSENGER: solo el detalle de sus propios reclamos.

// WithUsers conecta el repositorio de usuarios (para la empresa de una cuenta COMPANY).
func (h *ComplaintHandler) WithUsers(users userFinder) *ComplaintHandler {
	h.users = users
	return h
}

// actorForComplaints arma el actor de la petición (ver resolveActor).
func (h *ComplaintHandler) actorForComplaints(c *gin.Context) (requestActor, bool) {
	return resolveActor(c, h.users)
}

// companyScope devuelve la empresa a la que se limita una consulta de lista o
// cifras: la pedida (o todas, nil) para ADMIN, y siempre la propia para COMPANY.
func companyScope(actor requestActor, requested string) *string {
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
func canViewComplaint(actor requestActor, complaint *domain.Complaint) bool {
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
func canRespondComplaint(actor requestActor, complaint *domain.Complaint) bool {
	if actor.role == string(domain.UserRolePassenger) {
		return false
	}
	return canViewComplaint(actor, complaint)
}
