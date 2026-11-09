package main

import (
	"errors"
	"testing"
)

func TestDefaultCostWeightsAreValid(t *testing.T) {
	weights := defaultCostWeights()
	if err := weights.validate(); err != nil {
		t.Fatal(err)
	}
	if weights.WalkWeight <= weights.RideWeight {
		t.Error("caminar debe pesar más que viajar en micro")
	}
}

func TestCostWeightsRejectValuesBelowOne(t *testing.T) {
	invalidWeights := []CostWeights{
		{RideWeight: 0.5, WalkWeight: 2},
		{RideWeight: 1, WalkWeight: 0},
		{RideWeight: -1, WalkWeight: -1},
	}
	for _, weights := range invalidWeights {
		if err := weights.validate(); !errors.Is(err, errInvalidCostWeights) {
			t.Errorf("%+v: se esperaba errInvalidCostWeights y se obtuvo %v", weights, err)
		}
	}
}

func TestEdgeCostAppliesWeightByMode(t *testing.T) {
	weights := CostWeights{RideWeight: 1.5, WalkWeight: 2}
	rideEdge := Edge{ToStopID: "B", RouteID: "L1", BaseTimeSec: 100}
	walkEdge := Edge{ToStopID: "B", RouteID: walkRouteID, BaseTimeSec: 100}
	if cost := edgeCost(rideEdge, weights); cost != 150 {
		t.Errorf("micro: se esperaban 150 y se obtuvo %v", cost)
	}
	if cost := edgeCost(walkEdge, weights); cost != 200 {
		t.Errorf("caminata: se esperaban 200 y se obtuvo %v", cost)
	}
}

func TestPathCostOfHandCalculatedTrip(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	path, found := fastestPath(graph, "PAR-CSF-01", "PAR-MRODRI-01")
	if !found {
		t.Fatal("se esperaba una ruta")
	}
	// 300 s en micro con peso 1 y 120 s caminando con peso 2.
	if cost := pathCost(path, defaultCostWeights()); cost != 300+120*2 {
		t.Errorf("se esperaban 540 y se obtuvo %v", cost)
	}
}

// Con pesos de 1, el costo es exactamente el tiempo: el planificador actual es un
// caso particular de la función de costo.
func TestUnitWeightsMatchTravelTime(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	unitWeights := CostWeights{RideWeight: 1, WalkWeight: 1}
	for _, stopPair := range allStopPairs(graph) {
		path, found := fastestPath(graph, stopPair[0], stopPair[1])
		if !found {
			continue
		}
		if cost := pathCost(path, unitWeights); cost != float64(pathSeconds(path)) {
			t.Errorf("%s -> %s: costo %v y tiempo %d", stopPair[0], stopPair[1], cost, pathSeconds(path))
		}
	}
}

func TestPathCostNeverBelowTravelTime(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	for _, stopPair := range allStopPairs(graph) {
		for _, path := range alternativePaths(graph, stopPair[0], stopPair[1], 3) {
			if pathCost(path, defaultCostWeights()) < float64(pathSeconds(path)) {
				t.Errorf("%s -> %s: el costo no puede ser menor que el tiempo", stopPair[0], stopPair[1])
			}
		}
	}
}
