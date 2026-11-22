package main

// Validación común de las peticiones de rutas recomendadas. No depende de gRPC ni
// de HTTP: cualquier API que traduzca su petición a recommendationRequest aplica
// exactamente las mismas reglas y responde los mismos errores.

// maxRecommendedRoutes es el máximo de rutas por petición, igual que en las rutas
// a la universidad, así que el error de límite es el mismo.
const maxRecommendedRoutes = maxUniversityRoutes

// preferences devuelve las preferencias de la petición, con los valores por
// defecto en lo que no se indicó.
func (routeRequest recommendationRequest) preferences() RoutePreferences {
	if routeRequest.Preferences == nil {
		return defaultRoutePreferences()
	}
	return routeRequest.Preferences.withDefaults()
}

// costWeights son los pesos de la petición: los de su prioridad, más la ocupación
// si quiere evitar micros llenas, y el clima. Se usan para ordenar las rutas y
// también para informar su costo, así el costo de la respuesta explica el orden.
func (routeRequest recommendationRequest) costWeights() CostWeights {
	return preferenceCostWeights(routeRequest.preferences(), routeRequest.LineOccupancy, routeRequest.Weather)
}

// validate revisa la petición en un orden fijo, para que el cliente reciba siempre
// el mismo error: límite, origen y destino, ocupación, clima y preferencias.
func (routeRequest recommendationRequest) validate(graph *TransitGraph) error {
	if routeRequest.Limit < 1 || routeRequest.Limit > maxRecommendedRoutes {
		return errInvalidRouteLimit
	}
	if err := validateRoutePoints(graph, routeRequest.Origin, routeRequest.Destination); err != nil {
		return err
	}
	if isSamePoint(routeRequest.Origin, routeRequest.Destination) {
		return errSameOriginAndDestination
	}
	if err := validateOccupancy(routeRequest.LineOccupancy); err != nil {
		return err
	}
	if err := validateWeather(routeRequest.Weather); err != nil {
		return err
	}
	if routeRequest.Preferences != nil {
		return routeRequest.Preferences.validate()
	}
	return nil
}

// planRecommendations valida la petición y entrega sus rutas, de la más barata a
// la más cara.
func planRecommendations(graph *TransitGraph, routeRequest recommendationRequest) ([][]pathStep, error) {
	if err := routeRequest.validate(graph); err != nil {
		return nil, err
	}
	return recommendRoutes(graph, routeRequest.Origin, routeRequest.Destination, routeRequest.Limit,
		routeRequest.costWeights(), routeRequest.preferences().MaxWalkMeters)
}
