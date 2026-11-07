package main

// Punto de partida del pasajero. La distancia hasta un paradero se mide en línea
// recta, así que la caminata estimada es un mínimo, igual que el tiempo de viaje.

import (
	"math"
	"sort"
)

// walkingSpeedMps es la velocidad típica a pie de los datos (MODELO_GRAFO.md).
const walkingSpeedMps = 1.2

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
