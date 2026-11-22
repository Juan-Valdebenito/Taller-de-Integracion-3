package main

// Pesos de la función de costo para cada prioridad del pasajero. Cada prioridad
// parte de los pesos de siempre y cambia solo lo necesario para su objetivo.

const (
	// fewestTransfersPenaltySeconds hace que un cambio de línea equivalga a 30
	// minutos de viaje. Así casi siempre conviene una ruta con menos cambios,
	// aunque sea más lenta.
	fewestTransfersPenaltySeconds = 1800
	// leastWalkingWalkWeight hace que un minuto caminando pese como 5 minutos
	// arriba de la micro, en vez de 2.
	leastWalkingWalkWeight = 5.0
)

// priorityCostWeights devuelve los pesos de una prioridad. Una prioridad
// desconocida usa los pesos de siempre, igual que balanced.
func priorityCostWeights(priority RoutePriority) CostWeights {
	weights := defaultCostWeights()
	switch priority {
	case priorityFastest:
		// Con todos los pesos en 1 y sin penalización, el costo es el tiempo real
		// del viaje, incluida la espera estimada.
		weights.WalkWeight = 1
		weights.WaitWeight = 1
		weights.TransferPenaltySeconds = 0
	case priorityFewestTransfers:
		weights.TransferPenaltySeconds = fewestTransfersPenaltySeconds
	case priorityLeastWalking:
		weights.WalkWeight = leastWalkingWalkWeight
	}
	return weights
}

// preferenceCostWeights arma los pesos de una consulta: parte de los pesos de la
// prioridad y agrega la ocupación y el clima del momento. La ocupación solo se
// agrega si el pasajero quiere evitar micros llenas. El clima siempre se agrega:
// caminar con mal clima pesa igual, sea cual sea la prioridad.
// La caminata máxima no es un peso: limita qué caminatas se pueden usar.
func preferenceCostWeights(preferences RoutePreferences, occupancy LineOccupancy, weather *WeatherConditions) CostWeights {
	weights := priorityCostWeights(preferences.Priority)
	if preferences.AvoidCrowding {
		weights.Occupancy = occupancy
	}
	weights.Weather = weather
	return weights
}
