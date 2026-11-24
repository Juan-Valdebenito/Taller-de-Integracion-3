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

// routePreferencesJSON son las preferencias con que micro_service ordenó las
// rutas, con los valores por defecto ya aplicados.
type routePreferencesJSON struct {
	Priority      string `json:"priority"`
	MaxWalkMeters int32  `json:"max_walk_meters"`
	// AvoidCrowding es un puntero porque el campo es optional en el proto: si no
	// viniera, null es más honesto que false, que tiene otro significado.
	AvoidCrowding *bool `json:"avoid_crowding"`
}

// newRoutePreferencesJSON devuelve nil si micro_service no informó las
// preferencias. En el JSON queda null, igual que con los pesos.
func newRoutePreferencesJSON(preferences *microv1.RoutePreferences) *routePreferencesJSON {
	if preferences == nil {
		return nil
	}
	return &routePreferencesJSON{
		Priority:      preferences.GetPriority(),
		MaxWalkMeters: preferences.GetMaxWalkMeters(),
		AvoidCrowding: preferences.AvoidCrowding,
	}
}

// recommendationsJSON es la respuesta completa, con las rutas de menor a mayor
// costo.
type recommendationsJSON struct {
	Routes      []recommendedRouteJSON `json:"routes"`
	Total       int                    `json:"total"`
	CostWeights *costWeightsJSON       `json:"cost_weights"`
	Preferences *routePreferencesJSON  `json:"preferences"`
}

// newRecommendationsJSON conserva el orden de micro_service. Sin rutas, routes es
// una lista vacía y no null.
func newRecommendationsJSON(response *microv1.RecommendRoutesResponse) recommendationsJSON {
	routes := make([]recommendedRouteJSON, 0, len(response.GetRoutes()))
	for _, route := range response.GetRoutes() {
		routes = append(routes, newRecommendedRouteJSON(route))
	}
	return recommendationsJSON{
		Routes:      routes,
		Total:       len(routes),
		CostWeights: newCostWeightsJSON(response.GetCostWeights()),
		Preferences: newRoutePreferencesJSON(response.GetPreferences()),
	}
}
