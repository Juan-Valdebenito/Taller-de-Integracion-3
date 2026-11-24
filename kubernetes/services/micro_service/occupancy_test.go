package main

import (
	"math"
	"testing"
)

func TestCrowdingFactorByLevel(t *testing.T) {
	testCases := []struct {
		occupancyRatio float64
		expectedFactor float64
	}{
		{0, 1.0},
		{0.39, 1.0},
		{0.4, 1.1},
		{0.69, 1.1},
		{0.7, 1.3},
		{0.89, 1.3},
		{0.9, 1.6},
		{1.0, 1.6},
		{1.3, 1.6},
	}
	for _, testCase := range testCases {
		if factor := crowdingFactor(testCase.occupancyRatio); factor != testCase.expectedFactor {
			t.Errorf("ocupación %v: se esperaba %v y se obtuvo %v", testCase.occupancyRatio, testCase.expectedFactor, factor)
		}
	}
}

func TestCrowdingFactorIgnoresImpossibleValues(t *testing.T) {
	for _, occupancyRatio := range []float64{-0.5, math.NaN()} {
		if factor := crowdingFactor(occupancyRatio); factor != 1 {
			t.Errorf("ocupación %v: un valor imposible no debe penalizar, y se obtuvo %v", occupancyRatio, factor)
		}
	}
}

func TestCrowdingFactorNeverBelowOne(t *testing.T) {
	for occupancyRatio := 0.0; occupancyRatio <= 1.5; occupancyRatio += 0.01 {
		if factor := crowdingFactor(occupancyRatio); factor < 1 {
			t.Fatalf("ocupación %v: el factor %v es menor que 1", occupancyRatio, factor)
		}
	}
}

func weightsWithOccupancy(occupancy LineOccupancy) CostWeights {
	weights := defaultCostWeights()
	weights.Occupancy = occupancy
	return weights
}

func TestPathCostAddsCrowding(t *testing.T) {
	path := []pathStep{{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L7A", BaseTimeSec: 600}}}
	breakdown := pathCostBreakdown(path, weightsWithOccupancy(LineOccupancy{"L7A": 0.95}))
	// Viaje de 600 s en una micro llena: el factor 1,6 agrega 360 al viaje.
	expected := CostBreakdown{Ride: 600, Wait: 600, Crowding: 360, Total: 1560}
	if math.Abs(breakdown.Crowding-expected.Crowding) > 1e-9 || math.Abs(breakdown.Total-expected.Total) > 1e-9 ||
		breakdown.Ride != expected.Ride || breakdown.Wait != expected.Wait {
		t.Errorf("se esperaba %+v y se obtuvo %+v", expected, breakdown)
	}
}

func TestCrowdingDoesNotAffectWalking(t *testing.T) {
	path := []pathStep{{From: "A", Edge: Edge{ToStopID: "B", RouteID: walkRouteID, BaseTimeSec: 120}}}
	breakdown := pathCostBreakdown(path, weightsWithOccupancy(LineOccupancy{walkRouteID: 1}))
	if breakdown.Crowding != 0 || breakdown.Walk != 240 {
		t.Errorf("caminar no tiene ocupación: %+v", breakdown)
	}
}

// Dos líneas hacen el mismo trayecto: la 1 es más rápida, pero va llena.
func TestCheapestPathAvoidsFullLine(t *testing.T) {
	graph := NewTransitGraph()
	graph.Stops["ORIGIN"] = Stop{ID: "ORIGIN", Latitude: -38.70, Longitude: -72.60}
	graph.Stops["DESTINATION"] = Stop{ID: "DESTINATION", Latitude: -38.72, Longitude: -72.60}
	graph.Edges["ORIGIN"] = []Edge{
		{ToStopID: "DESTINATION", RouteID: "L1", BaseTimeSec: 600},
		{ToStopID: "DESTINATION", RouteID: "L2", BaseTimeSec: 700},
	}
	withoutOccupancy, _ := cheapestPath(graph, "ORIGIN", "DESTINATION", defaultCostWeights())
	if withoutOccupancy[0].Edge.RouteID != "L1" {
		t.Errorf("sin ocupación debe convenir la línea más rápida: %+v", withoutOccupancy)
	}
	// Con la línea 1 llena, su viaje cuesta 600 × 1,6 = 960, más que los 700 de la 2.
	crowdedWeights := weightsWithOccupancy(LineOccupancy{"L1": 0.95, "L2": 0.2})
	withOccupancy, _ := cheapestPath(graph, "ORIGIN", "DESTINATION", crowdedWeights)
	if withOccupancy[0].Edge.RouteID != "L2" {
		t.Errorf("con la línea 1 llena debe convenir la 2: %+v", withOccupancy)
	}
	aStarRoute, _ := aStarCheapestPath(graph, "ORIGIN", "DESTINATION", crowdedWeights)
	if aStarRoute[0].Edge.RouteID != "L2" {
		t.Errorf("A* debe elegir lo mismo que Dijkstra: %+v", aStarRoute)
	}
}

func TestAStarMatchesDijkstraWithOccupancy(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	assertAStarMatchesCheapest(t, graph, weightsWithOccupancy(LineOccupancy{"L7A": 0.95, "L7B": 0.75, "L1C": 0.5}))
}

func TestLineOccupancyFactorFor(t *testing.T) {
	occupancy := LineOccupancy{"L7A": 0.95, "L7B": 0.2}
	if factor := occupancy.factorFor("L7A"); factor != 1.6 {
		t.Errorf("la 7A va llena: se esperaba 1.6 y se obtuvo %v", factor)
	}
	if factor := occupancy.factorFor("L7B"); factor != 1.0 {
		t.Errorf("la 7B va vacía: se esperaba 1 y se obtuvo %v", factor)
	}
	if factor := occupancy.factorFor("L1C"); factor != 1.0 {
		t.Errorf("sin datos de la 1C no debe penalizar, y se obtuvo %v", factor)
	}
	var noOccupancy LineOccupancy
	if factor := noOccupancy.factorFor("L7A"); factor != 1.0 {
		t.Errorf("sin ninguna ocupación no debe penalizar, y se obtuvo %v", factor)
	}
}
