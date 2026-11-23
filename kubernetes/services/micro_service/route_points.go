package main

// Origen y destino de una recomendación de ruta. Cada uno puede ser un paradero o
// una coordenada. Con una coordenada, el viaje usa los paraderos cercanos y suma
// la caminata hasta ellos o desde ellos.

import "errors"

var (
	errInvalidRecommendationOrigin      = errors.New("provide origin_stop, or origin_lat and origin_long")
	errInvalidRecommendationDestination = errors.New("provide destination_stop, or destination_lat and destination_long")
	errUnknownDestinationStop           = errors.New("destination stop not found")
)

// RoutePoint es un paradero o una coordenada, nunca ambos.
type RoutePoint struct {
	StopID      string
	HasLocation bool
	Latitude    float64
	Longitude   float64
}

// validate revisa que el punto sea un paradero existente o una coordenada válida.
// missingError se devuelve si falta el punto o vienen ambas formas, y
// unknownStopError si el paradero no existe.
func (point RoutePoint) validate(graph *TransitGraph, missingError, unknownStopError error) error {
	hasStop := point.StopID != ""
	if hasStop == point.HasLocation {
		return missingError
	}
	if point.HasLocation {
		if !isValidLocation(point.Latitude, point.Longitude) {
			return errInvalidLocation
		}
		return nil
	}
	if _, exists := graph.Stops[point.StopID]; !exists {
		return unknownStopError
	}
	return nil
}

// validateRoutePoints revisa primero el origen y después el destino, para que el
// cliente sepa cuál corregir.
func validateRoutePoints(graph *TransitGraph, origin, destination RoutePoint) error {
	if err := origin.validate(graph, errInvalidRecommendationOrigin, errUnknownOriginStop); err != nil {
		return err
	}
	return destination.validate(graph, errInvalidRecommendationDestination, errUnknownDestinationStop)
}

// routeEndpoint es un paradero donde el viaje puede empezar o terminar, con la
// caminata que lo une a la coordenada del pasajero. Walk es nil si el punto ya era
// ese paradero.
type routeEndpoint struct {
	StopID string
	Walk   *pathStep
}

// originEndpoints entrega los paraderos desde los que puede salir el pasajero.
func originEndpoints(graph *TransitGraph, origin RoutePoint, maxWalkMeters int) ([]routeEndpoint, error) {
	if !origin.HasLocation {
		return []routeEndpoint{{StopID: origin.StopID}}, nil
	}
	nearbyStops := nearbyNetworkStops(graph, origin.Latitude, origin.Longitude, maxOriginStops, maxWalkMeters)
	if len(nearbyStops) == 0 {
		return nil, errNoNearbyStops
	}
	endpoints := make([]routeEndpoint, 0, len(nearbyStops))
	for _, nearbyStop := range nearbyStops {
		walkStep := initialWalkStep(nearbyStop)
		endpoints = append(endpoints, routeEndpoint{StopID: nearbyStop.StopID, Walk: &walkStep})
	}
	return endpoints, nil
}

// destinationEndpoints entrega los paraderos en los que puede bajarse el pasajero.
func destinationEndpoints(graph *TransitGraph, destination RoutePoint, maxWalkMeters int) ([]routeEndpoint, error) {
	if !destination.HasLocation {
		return []routeEndpoint{{StopID: destination.StopID}}, nil
	}
	nearbyStops := nearbyArrivalStops(graph, destination.Latitude, destination.Longitude, maxDestinationStops, maxWalkMeters)
	if len(nearbyStops) == 0 {
		return nil, errNoStopsNearDestination
	}
	endpoints := make([]routeEndpoint, 0, len(nearbyStops))
	for _, nearbyStop := range nearbyStops {
		walkStep := finalWalkStep(nearbyStop)
		endpoints = append(endpoints, routeEndpoint{StopID: nearbyStop.StopID, Walk: &walkStep})
	}
	return endpoints, nil
}
