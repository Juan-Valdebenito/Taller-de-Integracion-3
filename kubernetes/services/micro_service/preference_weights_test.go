package main

import "testing"

// sameBaseWeights compara los pesos numéricos. CostWeights no se puede comparar
// con == porque incluye un mapa de ocupación.
func sameBaseWeights(first, second CostWeights) bool {
	return first.RideWeight == second.RideWeight &&
		first.WalkWeight == second.WalkWeight &&
		first.WaitWeight == second.WaitWeight &&
		first.TransferPenaltySeconds == second.TransferPenaltySeconds
}

// Todos los pesos deben ser válidos, para que A* siga encontrando la ruta óptima.
func TestPriorityCostWeightsAreValid(t *testing.T) {
	for _, priority := range routePriorities() {
		if err := priorityCostWeights(priority).validate(); err != nil {
			t.Fatalf("weights for %q are invalid: %v", priority, err)
		}
	}
}

func TestBalancedPriorityUsesDefaultWeights(t *testing.T) {
	if !sameBaseWeights(priorityCostWeights(priorityBalanced), defaultCostWeights()) {
		t.Fatalf("balanced weights = %+v, want default %+v", priorityCostWeights(priorityBalanced), defaultCostWeights())
	}
}

func TestUnknownPriorityUsesDefaultWeights(t *testing.T) {
	if !sameBaseWeights(priorityCostWeights("unknown"), defaultCostWeights()) {
		t.Fatalf("unknown priority weights = %+v, want default", priorityCostWeights("unknown"))
	}
}

func TestFastestPriorityMeasuresRealTime(t *testing.T) {
	expectedWeights := CostWeights{RideWeight: 1, WalkWeight: 1, WaitWeight: 1, TransferPenaltySeconds: 0}
	if !sameBaseWeights(priorityCostWeights(priorityFastest), expectedWeights) {
		t.Fatalf("fastest weights = %+v, want %+v", priorityCostWeights(priorityFastest), expectedWeights)
	}
}

func TestFewestTransfersPriorityRaisesOnlyTransferPenalty(t *testing.T) {
	expectedWeights := defaultCostWeights()
	expectedWeights.TransferPenaltySeconds = fewestTransfersPenaltySeconds
	weights := priorityCostWeights(priorityFewestTransfers)
	if !sameBaseWeights(weights, expectedWeights) {
		t.Fatalf("fewest_transfers weights = %+v, want %+v", weights, expectedWeights)
	}
	if weights.TransferPenaltySeconds <= defaultCostWeights().TransferPenaltySeconds {
		t.Fatalf("transfer penalty %v is not above the default", weights.TransferPenaltySeconds)
	}
}

func TestLeastWalkingPriorityRaisesOnlyWalkWeight(t *testing.T) {
	expectedWeights := defaultCostWeights()
	expectedWeights.WalkWeight = leastWalkingWalkWeight
	weights := priorityCostWeights(priorityLeastWalking)
	if !sameBaseWeights(weights, expectedWeights) {
		t.Fatalf("least_walking weights = %+v, want %+v", weights, expectedWeights)
	}
	if weights.WalkWeight <= defaultCostWeights().WalkWeight {
		t.Fatalf("walk weight %v is not above the default", weights.WalkWeight)
	}
}

// Los pesos de una prioridad no deben traer ocupación ni clima: esos datos son de
// cada consulta y se agregan después.
func TestPriorityCostWeightsHaveNoQueryData(t *testing.T) {
	for _, priority := range routePriorities() {
		weights := priorityCostWeights(priority)
		if weights.Occupancy != nil || weights.Weather != nil {
			t.Fatalf("weights for %q include occupancy or weather", priority)
		}
	}
}

// preferencesWith devuelve las preferencias por defecto con otra prioridad y
// otra decisión sobre las micros llenas.
func preferencesWith(priority RoutePriority, avoidCrowding bool) RoutePreferences {
	preferences := defaultRoutePreferences()
	preferences.Priority = priority
	preferences.AvoidCrowding = avoidCrowding
	return preferences
}

func TestPreferenceCostWeightsUsePriorityWeights(t *testing.T) {
	for _, priority := range routePriorities() {
		weights := preferenceCostWeights(preferencesWith(priority, true), nil, nil)
		if !sameBaseWeights(weights, priorityCostWeights(priority)) {
			t.Fatalf("%q weights = %+v, want %+v", priority, weights, priorityCostWeights(priority))
		}
		if err := weights.validate(); err != nil {
			t.Fatalf("%q weights are invalid: %v", priority, err)
		}
	}
}

func TestPreferenceCostWeightsAddOccupancyWhenAvoidingCrowding(t *testing.T) {
	occupancy := LineOccupancy{"L7A": 0.95}
	weights := preferenceCostWeights(preferencesWith(priorityBalanced, true), occupancy, nil)
	if weights.Occupancy.factorFor("L7A") != fullCrowdingFactor {
		t.Fatalf("occupancy was not added: factor = %v", weights.Occupancy.factorFor("L7A"))
	}
}

// Si el pasajero no quiere evitar micros llenas, una micro llena no se penaliza.
func TestPreferenceCostWeightsIgnoreOccupancyWhenNotAvoidingCrowding(t *testing.T) {
	occupancy := LineOccupancy{"L7A": 0.95}
	weights := preferenceCostWeights(preferencesWith(priorityBalanced, false), occupancy, nil)
	if weights.Occupancy != nil {
		t.Fatalf("occupancy = %v, want nil", weights.Occupancy)
	}
	edge := Edge{ToStopID: "B", RouteID: "L7A", BaseTimeSec: 240}
	if surcharge := crowdingCost(edge, weights); surcharge != 0 {
		t.Fatalf("crowding surcharge = %v, want 0", surcharge)
	}
}

// El clima se aplica con cualquier prioridad y sin importar la ocupación.
func TestPreferenceCostWeightsAlwaysAddWeather(t *testing.T) {
	weather := &WeatherConditions{TemperatureC: -2}
	for _, priority := range routePriorities() {
		for _, avoidCrowding := range []bool{true, false} {
			weights := preferenceCostWeights(preferencesWith(priority, avoidCrowding), nil, weather)
			if weights.Weather != weather {
				t.Fatalf("%q avoid_crowding=%v: weather was not added", priority, avoidCrowding)
			}
		}
	}
}

// Las preferencias por defecto deben dar los mismos pesos que se usaban antes de
// existir las preferencias, para no cambiar el orden de las rutas actuales.
func TestDefaultPreferencesKeepCurrentWeights(t *testing.T) {
	occupancy := LineOccupancy{"L7A": 0.5}
	weather := &WeatherConditions{TemperatureC: 20}
	weights := preferenceCostWeights(defaultRoutePreferences(), occupancy, weather)
	if !sameBaseWeights(weights, defaultCostWeights()) {
		t.Fatalf("default preference weights = %+v, want %+v", weights, defaultCostWeights())
	}
	if weights.Occupancy["L7A"] != 0.5 || weights.Weather != weather {
		t.Fatalf("default preferences dropped occupancy or weather: %+v", weights)
	}
}
