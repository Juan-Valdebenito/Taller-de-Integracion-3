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
