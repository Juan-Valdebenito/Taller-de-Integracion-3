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
	if weights.WalkWeight <= weights.RideWeight || weights.WaitWeight <= weights.RideWeight {
		t.Error("caminar y esperar deben pesar más que viajar en micro")
	}
}

func TestExpectedWaitIsHalfTheDefaultHeadway(t *testing.T) {
	if wait := expectedWaitSeconds("L7A"); wait != defaultHeadwaySeconds/2 {
		t.Errorf("se esperaban %d s y se obtuvieron %d", defaultHeadwaySeconds/2, wait)
	}
}

func TestExpectedWaitUsesKnownHeadway(t *testing.T) {
	previousHeadways := lineHeadwaySeconds
	t.Cleanup(func() { lineHeadwaySeconds = previousHeadways })
	lineHeadwaySeconds = map[string]int{"L7B": 240}

	if wait := expectedWaitSeconds("L7B"); wait != 120 {
		t.Errorf("con una micro cada 240 s se esperaban 120 s y se obtuvieron %d", wait)
	}
	if wait := expectedWaitSeconds("L1C"); wait != defaultHeadwaySeconds/2 {
		t.Errorf("una línea sin datos debe usar el valor por defecto: %d", wait)
	}
}

func TestBoardingCostByRideState(t *testing.T) {
	weights := CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: 300}
	waitOnly := waitCost("L7B", weights)
	rideOnL7B := Edge{ToStopID: "B", RouteID: "L7B", BaseTimeSec: 60}
	testCases := []struct {
		name         string
		state        rideState
		edge         Edge
		expectedCost float64
	}{
		{"primera micro del viaje", rideState{}, rideOnL7B, waitOnly},
		{"sigue en la misma micro", rideState{LastRouteID: "L7B", OnBoard: true}, rideOnL7B, 0},
		{"cambia de línea", rideState{LastRouteID: "L7A", OnBoard: true}, rideOnL7B, waitOnly + 300},
		{"camina y cambia de línea", rideState{LastRouteID: "L7A", OnBoard: false}, rideOnL7B, waitOnly + 300},
		{"camina y vuelve a la misma línea", rideState{LastRouteID: "L7B", OnBoard: false}, rideOnL7B, waitOnly},
		{"caminar no cuesta abordaje", rideState{LastRouteID: "L7B", OnBoard: true}, Edge{ToStopID: "B", RouteID: walkRouteID}, 0},
	}
	for _, testCase := range testCases {
		if cost := boardingCost(testCase.state, testCase.edge, weights); cost != testCase.expectedCost {
			t.Errorf("%s: se esperaba %v y se obtuvo %v", testCase.name, testCase.expectedCost, cost)
		}
	}
}

func TestRideStateAfterEachEdge(t *testing.T) {
	onL7A := rideState{}.after(Edge{RouteID: "L7A"})
	if onL7A != (rideState{LastRouteID: "L7A", OnBoard: true}) {
		t.Errorf("después de la micro debe ir en L7A: %+v", onL7A)
	}
	afterWalking := onL7A.after(Edge{RouteID: walkRouteID})
	if afterWalking != (rideState{LastRouteID: "L7A", OnBoard: false}) {
		t.Errorf("caminar debe recordar la línea, pero bajarse de la micro: %+v", afterWalking)
	}
}

func TestWaitCostAppliesWeight(t *testing.T) {
	weights := CostWeights{RideWeight: 1, WalkWeight: 2, WaitWeight: 2.5}
	expectedCost := float64(defaultHeadwaySeconds/2) * 2.5
	if cost := waitCost("L7A", weights); cost != expectedCost {
		t.Errorf("se esperaban %v y se obtuvo %v", expectedCost, cost)
	}
}

func TestCostWeightsRejectValuesBelowOne(t *testing.T) {
	invalidWeights := []CostWeights{
		{RideWeight: 0.5, WalkWeight: 2, WaitWeight: 2},
		{RideWeight: 1, WalkWeight: 0, WaitWeight: 2},
		{RideWeight: 1, WalkWeight: 2, WaitWeight: 0.9},
		{RideWeight: -1, WalkWeight: -1, WaitWeight: -1},
		{RideWeight: 1, WalkWeight: 2, WaitWeight: 2, TransferPenaltySeconds: -1},
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
