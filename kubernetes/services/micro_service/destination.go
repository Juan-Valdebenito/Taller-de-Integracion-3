package main

// Destino del pasajero como coordenada. Es el caso inverso de la salida desde la
// ubicación (location.go): el viaje termina con una caminata desde un paradero
// cercano hasta el destino.

import "errors"

const (
	// maxDestinationStops limita los paraderos en los que se prueba terminar el
	// viaje, igual que maxOriginStops al inicio.
	maxDestinationStops = 3
	// destinationLocationID representa el destino del pasajero en el último tramo
	// a pie.
	destinationLocationID = "DESTINATION_LOCATION"
)

// errNoStopsNearDestination indica que no hay paraderos de la red a distancia
// caminable del destino.
var errNoStopsNearDestination = errors.New("no stops near destination")

// nearbyArrivalStops entrega hasta limit paraderos a no más de maxWalkMeters del
// destino, del más cercano al más lejano. Solo considera paraderos a los que llega
// alguna arista: en los demás no se puede terminar un viaje.
func nearbyArrivalStops(graph *TransitGraph, latitude, longitude float64, limit, maxWalkMeters int) []NearbyStop {
	arrivalStops := stopsWithArrivals(graph)
	hasArrivals := func(stopID string) bool { return arrivalStops[stopID] }
	return nearbyStopsMatching(graph, latitude, longitude, limit, maxWalkMeters, hasArrivals)
}

// stopsWithArrivals marca los paraderos a los que llega al menos una arista.
func stopsWithArrivals(graph *TransitGraph) map[string]bool {
	arrivalStops := make(map[string]bool)
	for _, edges := range graph.Edges {
		for _, edge := range edges {
			arrivalStops[edge.ToStopID] = true
		}
	}
	return arrivalStops
}

// finalWalkStep es la caminata desde el paradero donde se baja el pasajero hasta
// su destino.
func finalWalkStep(nearbyStop NearbyStop) pathStep {
	return pathStep{From: nearbyStop.StopID, Edge: Edge{
		ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: nearbyStop.WalkSeconds, DistanceM: nearbyStop.DistanceMeters,
	}}
}
