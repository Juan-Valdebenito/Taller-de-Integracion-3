package gpsreport

import (
	"context"
	"sync"
	"time"
)

// resolvedLineAge es cuánto se recuerda la línea de una ruta de la base.
const resolvedLineAge = 10 * time.Minute

// RouteCode entrega el código de una ruta de la base, por ejemplo "7B".
type RouteCode func(requestContext context.Context, routeID string) (code string, err error)

type resolvedLine struct {
	lineID    string
	known     bool
	expiresAt time.Time
}

// NewLineResolver traduce los IDs de ruta. Los del mapa ("route-7B") los traduce
// translate. Los conductores reales publican con el ID de su ruta en la base: para
// ellos se usa su código, que se recuerda unos minutos para no consultar la base en
// cada envío. routeCode puede ser nil si no hay base de datos.
func NewLineResolver(translate func(routeID string) (string, bool), routeCode RouteCode) LineResolver {
	var mutex sync.Mutex
	resolved := make(map[string]resolvedLine)
	return func(requestContext context.Context, routeID string) (string, bool) {
		if lineID, known := translate(routeID); known {
			return lineID, true
		}
		if routeCode == nil {
			return "", false
		}
		mutex.Lock()
		defer mutex.Unlock()
		if line, found := resolved[routeID]; found && time.Now().Before(line.expiresAt) {
			return line.lineID, line.known
		}
		code, err := routeCode(requestContext, routeID)
		if err != nil {
			// No se recuerda: puede ser una falla pasajera de la base.
			return "", false
		}
		lineID, known := translate("route-" + code)
		resolved[routeID] = resolvedLine{lineID: lineID, known: known, expiresAt: time.Now().Add(resolvedLineAge)}
		return lineID, known
	}
}
