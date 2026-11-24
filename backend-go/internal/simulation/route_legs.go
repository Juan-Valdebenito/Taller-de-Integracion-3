package simulation

// RouteLeg es el camino por las calles entre dos paraderos seguidos de una línea.
// Está separado por tramos, igual que RouteSegment, para repartir el tiempo oficial
// de cada tramo entre sus puntos.
type RouteLeg struct {
	FromStopID string
	ToStopID   string
	Path       []Waypoint
}

func (leg RouteLeg) meters() float64 {
	totalMeters := 0.0
	for pointIndex := 1; pointIndex < len(leg.Path); pointIndex++ {
		start, end := leg.Path[pointIndex-1], leg.Path[pointIndex]
		totalMeters += haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
	}
	return totalMeters
}

// followLegs hace que la línea recorra sus tramos por las calles. El tiempo oficial
// de cada tramo se reparte según la distancia, así la micro llega a cada paradero
// cuando dice el planificador. Los tramos sin tiempo oficial, como el regreso que
// cierra la 7A, usan la velocidad media del resto de la línea. Debe llamarse
// después de asignar Segments.
func (route *RouteDefinition) followLegs(legs []RouteLeg) {
	officialMeters, officialSeconds := 0.0, 0.0
	for segmentIndex, segment := range route.Segments {
		officialMeters += legs[segmentIndex].meters()
		officialSeconds += float64(segment.TravelSeconds)
	}
	route.Waypoints, route.waypointSeconds, route.stopWaypoints = nil, nil, make(map[int]bool)
	for legIndex, leg := range legs {
		legMeters := leg.meters()
		legSeconds := legMeters * officialSeconds / officialMeters
		if legIndex < len(route.Segments) {
			legSeconds = float64(route.Segments[legIndex].TravelSeconds)
		}
		route.stopWaypoints[len(route.Waypoints)] = true
		// El último punto de un tramo es el primero del siguiente.
		for pointIndex := 0; pointIndex < len(leg.Path)-1; pointIndex++ {
			start, end := leg.Path[pointIndex], leg.Path[pointIndex+1]
			straightMeters := haversineMeters(start.Lat, start.Lng, end.Lat, end.Lng)
			route.Waypoints = append(route.Waypoints, start)
			route.waypointSeconds = append(route.waypointSeconds, legSeconds*straightMeters/legMeters)
		}
	}
}

// isStop indica si en un punto suben y bajan pasajeros. Las líneas sin tramos no
// distinguen sus paraderos, así que todos sus puntos cuentan.
func (route *RouteDefinition) isStop(waypointIndex int) bool {
	return route.stopWaypoints == nil || route.stopWaypoints[waypointIndex]
}
