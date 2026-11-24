package main

// Planificador de rutas recomendadas entre cualquier origen y cualquier destino.
// Reutiliza la búsqueda por costo de las rutas a la universidad: lo nuevo es que
// el destino también puede ser una coordenada.

// recommendRoutes entrega hasta limit rutas desde el origen hasta el destino, de
// la más barata a la más cara según los pesos. Cada ruta incluye la caminata
// inicial y la final cuando el punto es una coordenada, así que su costo ya las
// considera. Ninguna caminata supera maxWalkMeters, la caminata máxima del
// pasajero. Si caminar todo el trayecto está dentro de ese máximo, también es una
// opción, y compite por costo con las demás.
func recommendRoutes(graph *TransitGraph, origin, destination RoutePoint, limit int, weights CostWeights, maxWalkMeters int) ([][]pathStep, error) {
	if err := validateRoutePoints(graph, origin, destination); err != nil {
		return nil, err
	}
	if isSamePoint(origin, destination) {
		return nil, errSameOriginAndDestination
	}
	if limit <= 0 {
		return nil, nil
	}
	routes, err := transitRoutes(graph, origin, destination, limit, weights, maxWalkMeters)
	walkRoute := directWalkRoute(graph, origin, destination, maxWalkMeters)
	if walkRoute == nil {
		if err != nil {
			return nil, err
		}
	} else {
		// Sin paraderos cerca todavía se puede llegar caminando, así que ese error
		// ya no aplica.
		routes = append(routes, walkRoute)
	}
	sortPathsByCost(routes, weights)
	if len(routes) > limit {
		routes = routes[:limit]
	}
	return routes, nil
}

// transitRoutes busca rutas que usan la red: desde cada paradero de salida hasta
// cada paradero de llegada, con las caminatas de cada extremo.
func transitRoutes(graph *TransitGraph, origin, destination RoutePoint, limit int, weights CostWeights, maxWalkMeters int) ([][]pathStep, error) {
	origins, err := originEndpoints(graph, origin, maxWalkMeters)
	if err != nil {
		return nil, err
	}
	destinations, err := destinationEndpoints(graph, destination, maxWalkMeters)
	if err != nil {
		return nil, err
	}
	searchGraph := graphWithMaxWalk(graph, maxWalkMeters)
	routes := make([][]pathStep, 0)
	for _, start := range origins {
		for _, end := range destinations {
			routes = append(routes, routesBetweenEndpoints(searchGraph, start, end, limit, weights)...)
		}
	}
	return routes, nil
}

// routesBetweenEndpoints busca hasta limit rutas entre dos paraderos y les agrega
// las caminatas de cada extremo. Si ambos extremos son el mismo paradero no hay
// viaje en micro que buscar: esa opción la cubre caminar todo el trayecto.
func routesBetweenEndpoints(graph *TransitGraph, start, end routeEndpoint, limit int, weights CostWeights) [][]pathStep {
	if start.StopID == end.StopID {
		return nil
	}
	paths := cheapestAlternativePaths(graph, start.StopID, end.StopID, limit, weights)
	routes := make([][]pathStep, 0, len(paths))
	for _, path := range paths {
		routes = append(routes, withEndpointWalks(path, start, end))
	}
	return routes
}

// withEndpointWalks arma una ruta nueva con la caminata inicial, el viaje y la
// caminata final. No modifica el camino recibido.
func withEndpointWalks(path []pathStep, start, end routeEndpoint) []pathStep {
	route := make([]pathStep, 0, len(path)+2)
	if start.Walk != nil {
		route = append(route, *start.Walk)
	}
	route = append(route, path...)
	if end.Walk != nil {
		route = append(route, *end.Walk)
	}
	return route
}
