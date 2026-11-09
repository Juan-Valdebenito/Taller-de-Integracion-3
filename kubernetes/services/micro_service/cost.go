package main

// Función de costo ponderada. El costo se mide en segundos equivalentes: cuánto
// le pesa al pasajero cada parte del viaje. Un minuto caminando suele percibirse
// como más pesado que un minuto sentado en la micro, y los pesos lo representan.

import "errors"

// errInvalidCostWeights indica pesos que impedirían comparar rutas correctamente.
var errInvalidCostWeights = errors.New("cost weights must be at least 1")

// CostWeights multiplica el tiempo de cada tipo de tramo.
type CostWeights struct {
	// RideWeight multiplica el tiempo arriba de la micro.
	RideWeight float64
	// WalkWeight multiplica el tiempo caminando.
	WalkWeight float64
	// WaitWeight multiplica el tiempo esperando la micro en el paradero.
	WaitWeight float64
}

// defaultCostWeights usa valores típicos de planificación de transporte: caminar
// y esperar pesan el doble que viajar en micro. Son un punto de partida ajustable.
func defaultCostWeights() CostWeights {
	return CostWeights{RideWeight: 1.0, WalkWeight: 2.0, WaitWeight: 2.0}
}

// validate exige pesos de al menos 1. Así el costo nunca es menor que el tiempo
// real, y la estimación de A* basada en tiempo sigue siendo válida.
func (weights CostWeights) validate() error {
	if weights.RideWeight < 1 || weights.WalkWeight < 1 || weights.WaitWeight < 1 {
		return errInvalidCostWeights
	}
	return nil
}

// defaultHeadwaySeconds es el intervalo supuesto entre dos micros de una misma
// línea. Es un supuesto: los datos no incluyen frecuencias ni horarios.
const defaultHeadwaySeconds = 600

// lineHeadwaySeconds guarda el intervalo real de una línea cuando se conozca. Las
// líneas que no aparecen usan defaultHeadwaySeconds.
var lineHeadwaySeconds = map[string]int{}

func headwaySeconds(routeID string) int {
	if headway, known := lineHeadwaySeconds[routeID]; known {
		return headway
	}
	return defaultHeadwaySeconds
}

// expectedWaitSeconds supone que el pasajero llega al paradero en un momento al
// azar: en promedio espera la mitad del intervalo entre micros.
func expectedWaitSeconds(routeID string) int {
	return headwaySeconds(routeID) / 2
}

// waitCost es el costo de esperar una micro de la línea indicada.
func waitCost(routeID string, weights CostWeights) float64 {
	return float64(expectedWaitSeconds(routeID)) * weights.WaitWeight
}

// edgeCost es el costo de recorrer una arista, según si es a pie o en micro.
func edgeCost(edge Edge, weights CostWeights) float64 {
	travelSeconds := float64(edge.BaseTimeSec)
	if edge.RouteID == walkRouteID {
		return travelSeconds * weights.WalkWeight
	}
	return travelSeconds * weights.RideWeight
}

// pathCost suma el costo de todos los tramos de una ruta.
func pathCost(path []pathStep, weights CostWeights) float64 {
	totalCost := 0.0
	for _, step := range path {
		totalCost += edgeCost(step.Edge, weights)
	}
	return totalCost
}
