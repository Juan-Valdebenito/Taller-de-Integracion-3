package main

// Casos especiales de una recomendación: el origen igual al destino, y caminar
// todo el trayecto cuando está dentro de la caminata máxima.

import (
	"errors"
	"math"
)

// errSameOriginAndDestination indica que no hay viaje que recomendar.
var errSameOriginAndDestination = errors.New("origin and destination are the same")

// isSamePoint indica si dos puntos son el mismo paradero o la misma coordenada.
// Un paradero y una coordenada nunca se consideran iguales: entre ellos se camina,
// aunque sean 0 metros.
func isSamePoint(origin, destination RoutePoint) bool {
	if origin.HasLocation != destination.HasLocation {
		return false
	}
	if origin.HasLocation {
		return origin.Latitude == destination.Latitude && origin.Longitude == destination.Longitude
	}
	return origin.StopID == destination.StopID
}

// coordinates devuelve la posición del punto: la suya si es una coordenada, o la
// del paradero.
func (point RoutePoint) coordinates(graph *TransitGraph) (float64, float64) {
	if point.HasLocation {
		return point.Latitude, point.Longitude
	}
	stop := graph.Stops[point.StopID]
	return stop.Latitude, stop.Longitude
}

// walkPointID es el ID con que el punto aparece en un tramo a pie.
func (point RoutePoint) walkPointID(locationID string) string {
	if point.HasLocation {
		return locationID
	}
	return point.StopID
}

// directWalkRoute es la ruta de caminar todo el trayecto, si no supera
// maxWalkMeters. Entre dos paraderos no se agrega: el grafo ya tiene sus
// transbordos a pie, medidos por la calle y no en línea recta.
func directWalkRoute(graph *TransitGraph, origin, destination RoutePoint, maxWalkMeters int) []pathStep {
	if !origin.HasLocation && !destination.HasLocation {
		return nil
	}
	originLatitude, originLongitude := origin.coordinates(graph)
	destinationLatitude, destinationLongitude := destination.coordinates(graph)
	straightDistance := haversineMeters(originLatitude, originLongitude, destinationLatitude, destinationLongitude)
	if straightDistance > float64(maxWalkMeters) {
		return nil
	}
	return []pathStep{{From: origin.walkPointID(userLocationID), Edge: Edge{
		ToStopID:    destination.walkPointID(destinationLocationID),
		RouteID:     walkRouteID,
		BaseTimeSec: int(math.Ceil(straightDistance / walkingSpeedMps)),
		DistanceM:   int(math.Round(straightDistance)),
	}}}
}
