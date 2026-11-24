package handler

// JSON de GET /api/v1/recommendations/route. Usa los mismos nombres de campo que
// las rutas a la universidad, para que la app los lea igual.

import microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"

// recommendedRouteJSON es una ruta recomendada. Los campos no usan omitempty: un 0
// en transfers es un dato válido que la app debe recibir.
type recommendedRouteJSON struct {
	// TotalTimeSeconds no incluye la espera en el paradero, que es una estimación
	// y va aparte, en el costo.
	TotalTimeSeconds    int32          `json:"total_time_seconds"`
	TotalDistanceMeters int32          `json:"total_distance_meters"`
	Transfers           int32          `json:"transfers"`
	Movements           []movementJSON `json:"movements"`
	// Cost es el costo con que micro_service ordenó la ruta.
	Cost costBreakdownJSON `json:"cost"`
}

func newRecommendedRouteJSON(route *microv1.RecommendedRoute) recommendedRouteJSON {
	return recommendedRouteJSON{
		TotalTimeSeconds:    route.GetTotalTimeSeconds(),
		TotalDistanceMeters: route.GetTotalDistanceMeters(),
		Transfers:           route.GetTransfers(),
		Movements:           newMovementsJSON(route.GetMovements()),
		Cost:                newCostBreakdownJSON(route.GetCost()),
	}
}
