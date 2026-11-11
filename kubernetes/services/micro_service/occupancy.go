package main

// Ocupación de las micros en el costo. Un minuto de pie en una micro llena se
// percibe más largo que uno sentado, así que el viaje se multiplica por un factor
// según qué tan llena va la línea.

import "math"

// Límites de los niveles de ocupación. Son los mismos que usa OccupancyService
// en backend-go, para que ambos servicios hablen de los mismos niveles.
const (
	mediumOccupancyRatio = 0.4
	highOccupancyRatio   = 0.7
	fullOccupancyRatio   = 0.9
)

// Factores por nivel. Son un supuesto ajustable, como los pesos del costo. Todos
// son al menos 1, así el costo nunca baja del tiempo real y A* sigue siendo válido.
const (
	lowCrowdingFactor    = 1.0
	mediumCrowdingFactor = 1.1
	highCrowdingFactor   = 1.3
	fullCrowdingFactor   = 1.6
)

// LineOccupancy guarda la ocupación de cada línea, de 0 a 1, por su route_id.
// Puede superar 1 si la micro va sobre su capacidad.
type LineOccupancy map[string]float64

// crowdingFactor convierte una ocupación en el multiplicador del viaje. Un valor
// imposible, como uno negativo, se trata como desconocido y no penaliza.
func crowdingFactor(occupancyRatio float64) float64 {
	switch {
	case math.IsNaN(occupancyRatio) || occupancyRatio < 0:
		return lowCrowdingFactor
	case occupancyRatio < mediumOccupancyRatio:
		return lowCrowdingFactor
	case occupancyRatio < highOccupancyRatio:
		return mediumCrowdingFactor
	case occupancyRatio < fullOccupancyRatio:
		return highCrowdingFactor
	default:
		return fullCrowdingFactor
	}
}

// factorFor es el multiplicador de una línea. Sin datos de ocupación no penaliza:
// es mejor no inventar una micro llena.
func (occupancy LineOccupancy) factorFor(routeID string) float64 {
	occupancyRatio, known := occupancy[routeID]
	if !known {
		return lowCrowdingFactor
	}
	return crowdingFactor(occupancyRatio)
}
