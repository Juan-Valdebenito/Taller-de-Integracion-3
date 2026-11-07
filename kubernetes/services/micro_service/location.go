package main

// Punto de partida del pasajero. La distancia hasta un paradero se mide en línea
// recta, así que la caminata estimada es un mínimo, igual que el tiempo de viaje.

import (
	"errors"
	"math"
	"sort"
)

const (
	// walkingSpeedMps es la velocidad típica a pie de los datos (MODELO_GRAFO.md).
	walkingSpeedMps = 1.2
	// maxOriginStops limita los paraderos desde los que se prueba iniciar el viaje.
	maxOriginStops = 3
	// userLocationID representa la posición del pasajero en el primer tramo a pie.
	userLocationID = "USER_LOCATION"
)

// errNoNearbyStops indica que no hay paraderos de la red a distancia caminable.
var errNoNearbyStops = errors.New("no nearby stops")

// NearbyStop es un paradero de la red al que el pasajero puede llegar caminando.
type NearbyStop struct {
	StopID         string
	DistanceMeters int
	WalkSeconds    int
}

// nearbyNetworkStops entrega hasta limit paraderos a una distancia caminable, del
// más cercano al más lejano. Omite los que no tienen aristas de salida: están en
// el catálogo, pero desde ellos no se puede iniciar un viaje.
func nearbyNetworkStops(graph *TransitGraph, latitude, longitude float64, limit int) []NearbyStop {
	if limit <= 0 {
		return nil
	}
	nearbyStops := make([]NearbyStop, 0, limit)
	for stopID, stop := range graph.Stops {
		if len(graph.Edges[stopID]) == 0 {
			continue
		}
		straightDistance := haversineMeters(latitude, longitude, stop.Latitude, stop.Longitude)
		if straightDistance > maxWalkDistanceMeters {
			continue
		}
		nearbyStops = append(nearbyStops, NearbyStop{
			StopID:         stopID,
			DistanceMeters: int(math.Round(straightDistance)),
			WalkSeconds:    int(math.Ceil(straightDistance / walkingSpeedMps)),
		})
	}
	sort.Slice(nearbyStops, func(firstIndex, secondIndex int) bool {
		first, second := nearbyStops[firstIndex], nearbyStops[secondIndex]
		if first.DistanceMeters != second.DistanceMeters {
			return first.DistanceMeters < second.DistanceMeters
		}
		return first.StopID < second.StopID
	})
	if len(nearbyStops) > limit {
		nearbyStops = nearbyStops[:limit]
	}
	return nearbyStops
}

// routesFromLocation entrega rutas hacia la universidad desde la posición del
// pasajero. Cada ruta parte con la caminata al paradero, así que su tiempo total
// ya la incluye. Con campusID vacío considera todos los campus.
func routesFromLocation(graph *TransitGraph, latitude, longitude float64, campusID string, limit int) ([]UniversityRoute, error) {
	campuses, err := selectCampuses(campusID)
	if err != nil {
		return nil, err
	}
	nearbyStops := nearbyNetworkStops(graph, latitude, longitude, maxOriginStops)
	if len(nearbyStops) == 0 {
		return nil, errNoNearbyStops
	}
	routesByCampus := make([][]UniversityRoute, 0, len(campuses))
	for _, campus := range campuses {
		routes := routesFromNearbyStops(graph, nearbyStops, campus, limit)
		sortUniversityRoutes(routes)
		if len(routes) > 0 {
			routesByCampus = append(routesByCampus, routes)
		}
	}
	return mergeCampusRoutes(routesByCampus, limit), nil
}

// routesFromNearbyStops prueba partir desde cada paradero cercano. Si el paradero
// es parte del campus, basta con caminar hasta él.
func routesFromNearbyStops(graph *TransitGraph, nearbyStops []NearbyStop, campus Campus, limit int) []UniversityRoute {
	routes := make([]UniversityRoute, 0)
	for _, nearbyStop := range nearbyStops {
		walkStep := initialWalkStep(nearbyStop)
		if campus.hasStop(nearbyStop.StopID) {
			routes = append(routes, UniversityRoute{
				CampusID: campus.ID, CampusName: campus.Name, DestinationStopID: nearbyStop.StopID, Path: []pathStep{walkStep},
			})
			continue
		}
		for _, route := range routesToCampus(graph, nearbyStop.StopID, campus, limit) {
			route.Path = append([]pathStep{walkStep}, route.Path...)
			routes = append(routes, route)
		}
	}
	return routes
}

func initialWalkStep(nearbyStop NearbyStop) pathStep {
	return pathStep{From: userLocationID, Edge: Edge{
		ToStopID: nearbyStop.StopID, RouteID: walkRouteID, BaseTimeSec: nearbyStop.WalkSeconds, DistanceM: nearbyStop.DistanceMeters,
	}}
}
