package main

// Función de costo ponderada. El costo se mide en segundos equivalentes: cuánto
// le pesa al pasajero cada parte del viaje. Un minuto caminando suele percibirse
// como más pesado que un minuto sentado en la micro, y los pesos lo representan.

import (
	"errors"
	"fmt"
	"math"
	"os"
	"strconv"
)

// errInvalidCostWeights indica pesos que impedirían comparar rutas correctamente.
var errInvalidCostWeights = errors.New("ride, walk and wait weights must be at least 1; transfer penalty must be non-negative")

// CostWeights multiplica el tiempo de cada tipo de tramo.
type CostWeights struct {
	// RideWeight multiplica el tiempo arriba de la micro.
	RideWeight float64
	// WalkWeight multiplica el tiempo caminando.
	WalkWeight float64
	// WaitWeight multiplica el tiempo esperando la micro en el paradero.
	WaitWeight float64
	// TransferPenaltySeconds se suma cada vez que el pasajero cambia de línea:
	// representa la molestia de bajarse y subirse a otra micro.
	TransferPenaltySeconds float64
	// Occupancy es la ocupación de cada línea en esta consulta. Sin datos, ninguna
	// línea se penaliza.
	Occupancy LineOccupancy
	// Weather es el clima de esta consulta. Sin datos (nil), caminar no se penaliza.
	Weather *WeatherConditions
	// HeadwaySeconds es cada cuánto pasa una línea según el GPS de esta consulta. Las
	// líneas que no aparecen usan el intervalo supuesto.
	HeadwaySeconds map[string]int
}

// configuredCostWeights parte con los valores de respaldo y se reemplaza al
// inicio con los valores válidos leídos desde las variables de entorno.
var configuredCostWeights = CostWeights{
	RideWeight:             1.0,
	WalkWeight:             2.0,
	WaitWeight:             2.0,
	TransferPenaltySeconds: 300,
}

// defaultCostWeights devuelve los pesos cargados al iniciar el servicio. Si una
// variable de entorno no está definida, se conserva su valor de respaldo.
func defaultCostWeights() CostWeights {
	return configuredCostWeights
}

// loadCostWeightsFromEnv lee los pesos configurables desde el entorno y conserva
// los valores de respaldo para las variables que no estén definidas.
func loadCostWeightsFromEnv() (CostWeights, error) {
	weights := configuredCostWeights

	values := []struct {
		name string
		dst  *float64
	}{
		{"RIDE_WEIGHT", &weights.RideWeight},
		{"WALK_WEIGHT", &weights.WalkWeight},
		{"WAIT_WEIGHT", &weights.WaitWeight},
		{"TRANSFER_PENALTY_SECONDS", &weights.TransferPenaltySeconds},
	}

	for _, value := range values {
		raw := os.Getenv(value.name)
		if raw == "" {
			continue
		}

		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return CostWeights{}, fmt.Errorf("%s debe ser numérico: %w", value.name, err)
		}
		*value.dst = parsed
	}

	if err := weights.validate(); err != nil {
		return CostWeights{}, err
	}
	return weights, nil
}

// validate exige pesos de viaje, caminata y espera finitos y de al menos 1, y una
// penalización por transbordo finita y no negativa. Así el costo no queda por
// debajo del tiempo real y la estimación de A* basada en tiempo sigue siendo válida.
func (weights CostWeights) validate() error {
	if math.IsNaN(weights.RideWeight) || math.IsInf(weights.RideWeight, 0) || weights.RideWeight < 1 ||
		math.IsNaN(weights.WalkWeight) || math.IsInf(weights.WalkWeight, 0) || weights.WalkWeight < 1 ||
		math.IsNaN(weights.WaitWeight) || math.IsInf(weights.WaitWeight, 0) || weights.WaitWeight < 1 ||
		math.IsNaN(weights.TransferPenaltySeconds) || math.IsInf(weights.TransferPenaltySeconds, 0) || weights.TransferPenaltySeconds < 0 {
		return errInvalidCostWeights
	}
	return nil
}

// rideState es la situación del pasajero antes de un tramo: la última línea en
// la que viajó y si todavía va arriba de esa micro.
type rideState struct {
	LastRouteID string
	OnBoard     bool
}

// after devuelve la situación del pasajero después de recorrer un tramo.
func (state rideState) after(edge Edge) rideState {
	if edge.RouteID == walkRouteID {
		return rideState{LastRouteID: state.LastRouteID, OnBoard: false}
	}
	return rideState{LastRouteID: edge.RouteID, OnBoard: true}
}

// boardingCost es lo que cuesta subirse a la micro de un tramo. Seguir en la
// misma micro no cuesta nada. Si hay que subirse, se espera; y si es una línea
// distinta a la anterior, también se suma la penalización por transbordo.
// Bajarse, caminar y volver a la misma línea exige esperar, pero no es un
// cambio de línea, igual que en countTransfers.
func boardingCost(state rideState, edge Edge, weights CostWeights) float64 {
	if !needsBoarding(state, edge) {
		return 0
	}
	cost := waitCost(edge.RouteID, weights)
	if changesLine(state, edge) {
		cost += weights.TransferPenaltySeconds
	}
	return cost
}

// needsBoarding indica si el tramo exige subirse a una micro: es en micro y el
// pasajero no venía ya arriba de esa misma línea.
func needsBoarding(state rideState, edge Edge) bool {
	if edge.RouteID == walkRouteID {
		return false
	}
	return !state.OnBoard || state.LastRouteID != edge.RouteID
}

// changesLine indica si subirse a la micro del tramo es un cambio de línea.
func changesLine(state rideState, edge Edge) bool {
	return needsBoarding(state, edge) && state.LastRouteID != "" && state.LastRouteID != edge.RouteID
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
	return float64(weights.waitSeconds(routeID)) * weights.WaitWeight
}

// waitSeconds es la espera de una línea: la mitad del intervalo observado con GPS
// o, sin él, la espera supuesta.
func (weights CostWeights) waitSeconds(routeID string) int {
	if headway, observed := weights.HeadwaySeconds[routeID]; observed {
		return headway / 2
	}
	return expectedWaitSeconds(routeID)
}

// edgeCost es el costo de recorrer una arista, según si es a pie o en micro. En
// micro incluye el recargo por ocupación.
func edgeCost(edge Edge, weights CostWeights) float64 {
	if edge.RouteID == walkRouteID {
		return baseWalkCost(edge, weights) + weatherCost(edge, weights)
	}
	return baseRideCost(edge, weights) + crowdingCost(edge, weights)
}

// baseWalkCost es la caminata sin considerar el clima.
func baseWalkCost(edge Edge, weights CostWeights) float64 {
	return float64(edge.BaseTimeSec) * weights.WalkWeight
}

// weatherCost es el recargo por caminar con mal clima: la parte de la caminata
// que se agrega al multiplicar por el factor del clima.
func weatherCost(edge Edge, weights CostWeights) float64 {
	return baseWalkCost(edge, weights) * (walkWeatherFactor(weights.Weather) - 1)
}

// baseRideCost es el viaje en micro sin considerar la ocupación.
func baseRideCost(edge Edge, weights CostWeights) float64 {
	return float64(edge.BaseTimeSec) * weights.RideWeight
}

// crowdingCost es el recargo por viajar en una micro llena: la parte del viaje
// que se agrega al multiplicar por el factor de ocupación.
func crowdingCost(edge Edge, weights CostWeights) float64 {
	return baseRideCost(edge, weights) * (weights.Occupancy.factorFor(edge.RouteID) - 1)
}

// CostBreakdown separa el costo de una ruta por componente, en segundos
// equivalentes. Permite explicar por qué una ruta cuesta lo que cuesta.
type CostBreakdown struct {
	Ride     float64
	Walk     float64
	Wait     float64
	Transfer float64
	// Crowding es el recargo por viajar en micros llenas.
	Crowding float64
	// Weather es el recargo por caminar con mal clima.
	Weather float64
	Total   float64
}

// pathCostBreakdown recorre la ruta tramo a tramo. Antes de cada tramo en micro
// suma lo que cuesta abordarla, según la situación en que venía el pasajero.
func pathCostBreakdown(path []pathStep, weights CostWeights) CostBreakdown {
	return pathCostBreakdownFrom(path, weights, rideState{})
}

// pathCostBreakdownFrom calcula el costo de una ruta que parte en una situación
// dada, por ejemplo arriba de una micro.
func pathCostBreakdownFrom(path []pathStep, weights CostWeights, initialState rideState) CostBreakdown {
	var breakdown CostBreakdown
	state := initialState
	for _, step := range path {
		if step.Edge.RouteID == walkRouteID {
			breakdown.Walk += baseWalkCost(step.Edge, weights)
			breakdown.Weather += weatherCost(step.Edge, weights)
		} else {
			if needsBoarding(state, step.Edge) {
				breakdown.Wait += waitCost(step.Edge.RouteID, weights)
			}
			if changesLine(state, step.Edge) {
				breakdown.Transfer += weights.TransferPenaltySeconds
			}
			breakdown.Ride += baseRideCost(step.Edge, weights)
			breakdown.Crowding += crowdingCost(step.Edge, weights)
		}
		state = state.after(step.Edge)
	}
	breakdown.Total = breakdown.Ride + breakdown.Walk + breakdown.Wait + breakdown.Transfer + breakdown.Crowding + breakdown.Weather
	return breakdown
}

// pathCost es el costo total de una ruta.
func pathCost(path []pathStep, weights CostWeights) float64 {
	return pathCostBreakdown(path, weights).Total
}
