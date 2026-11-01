package websocket

import (
	"context"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain"
)

// PublishAuthorizer decide si una cuenta puede publicar la posición de una
// micro en una ruta. Devuelve el motivo del rechazo, o "" si puede.
// Esta interfaz permite usar un autorizador real con repositorios o uno que
// rechaza todo cuando no hay base de datos, sin acoplar Client a PostgreSQL.
type PublishAuthorizer interface {
	CanPublish(ctx context.Context, userID, role, busID, routeID string) string
}

// Interfaces mínimas de los repositorios (los implementan los de repository).
type (
	UserFinder interface {
		FindByID(ctx context.Context, id string) (*domain.User, error)
	}
	BusFinder interface {
		FindByID(ctx context.Context, id string) (*domain.Bus, error)
	}
	RouteFinder interface {
		FindByID(ctx context.Context, id string) (*domain.Route, error)
	}
)

// RepoAuthorizer aplica las reglas con los datos de la base:
//   - ADMIN: cualquier micro existente.
//   - COMPANY: solo micros y rutas de su empresa (la empresa se lee de la
//     base: el token no la trae).
type RepoAuthorizer struct {
	Users  UserFinder
	Buses  BusFinder
	Routes RouteFinder
}

const (
	errCannotVerify = "No se pudo verificar la micro, intenta nuevamente"
	errNotYourBus   = "La micro no existe o no pertenece a tu empresa"
	errNotYourRoute = "La ruta no existe o no pertenece a tu empresa"
)

func (a RepoAuthorizer) CanPublish(ctx context.Context, userID, role, busID, routeID string) string {
	// Primero se verifica que la micro exista. Luego COMPANY debe ser dueño
	// tanto de la micro como de la ruta; la empresa se obtiene desde la BD y no
	// se confía en un dato que el cliente pudiera falsificar en el JWT.
	bus, err := a.Buses.FindByID(ctx, busID)
	if err != nil {
		return errCannotVerify
	}
	if bus == nil {
		return errNotYourBus
	}
	if role == string(domain.UserRoleAdmin) {
		return ""
	}

	user, err := a.Users.FindByID(ctx, userID)
	if err != nil {
		return errCannotVerify
	}
	if user == nil || user.CompanyID == nil || *user.CompanyID == "" {
		return "Tu cuenta no tiene una empresa asignada"
	}
	company := *user.CompanyID
	if bus.CompanyID != company {
		return errNotYourBus
	}

	route, err := a.Routes.FindByID(ctx, routeID)
	if err != nil {
		return errCannotVerify
	}
	if route == nil || route.CompanyID != company {
		return errNotYourRoute
	}
	return ""
}

// UnavailableAuthorizer rechaza toda publicación: se usa cuando el backend
// corre sin base de datos y no hay cómo verificar de quién es la micro (la
// simulación publica por dentro y no pasa por aquí).
type UnavailableAuthorizer struct{}

func (UnavailableAuthorizer) CanPublish(context.Context, string, string, string, string) string {
	return "No se puede verificar la micro en este momento (sin base de datos)"
}
