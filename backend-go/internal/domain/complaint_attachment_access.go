package domain

import "strings"

// Actor es quien hace la solicitud: el usuario autenticado y su rol, tal como
// vienen en el JWT. Un Actor vacío representa a alguien sin sesión.
type Actor struct {
	UserID string
	Role   UserRole
}

// isOwner indica si el actor es el pasajero que creó el reclamo.
func (a Actor) isOwner(c *Complaint) bool {
	if c == nil || c.PassengerID == nil {
		return false
	}
	id := strings.TrimSpace(a.UserID)
	return id != "" && a.Role == UserRolePassenger && id == *c.PassengerID
}

func (a Actor) isAdmin() bool {
	return strings.TrimSpace(a.UserID) != "" && a.Role == UserRoleAdmin
}

// Permisos sobre las imágenes de un reclamo:
//
//	subir        → solo el pasajero dueño del reclamo (son su evidencia)
//	ver/descargar → el dueño y los administradores
//	borrar        → el dueño y los administradores
//
// Los usuarios de empresa (COMPANY) no tienen acceso por ahora: el JWT no trae
// su empresa, y sin ese dato podrían ver imágenes de reclamos de otras empresas.

// CanUploadAttachment indica si el actor puede subir imágenes al reclamo.
func CanUploadAttachment(c *Complaint, a Actor) bool {
	return a.isOwner(c)
}

// CanViewAttachments indica si el actor puede listar y descargar las imágenes del reclamo.
func CanViewAttachments(c *Complaint, a Actor) bool {
	return a.isOwner(c) || (c != nil && a.isAdmin())
}

// CanDeleteAttachment indica si el actor puede borrar imágenes del reclamo.
func CanDeleteAttachment(c *Complaint, a Actor) bool {
	return a.isOwner(c) || (c != nil && a.isAdmin())
}
