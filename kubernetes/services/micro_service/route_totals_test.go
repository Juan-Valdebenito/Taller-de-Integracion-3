package main

import "testing"

// Caminata inicial de 84 s, micro de 240 s y caminata final de 46 s: 370 s. La
// espera no se suma.
func TestPathTotalSecondsIncludesWalksButNotWait(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, BaseTimeSec: 84}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", BaseTimeSec: 240}},
		{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, BaseTimeSec: 46}},
	}
	if totalSeconds := pathTotalSeconds(path); totalSeconds != 370 {
		t.Fatalf("total = %d s, want 370", totalSeconds)
	}
}

func TestPathTotalSecondsOfEmptyPath(t *testing.T) {
	if totalSeconds := pathTotalSeconds(nil); totalSeconds != 0 {
		t.Fatalf("total = %d s, want 0", totalSeconds)
	}
}

// Caminata inicial de 100 m, micro de 950 m y caminata final de 55 m: 1105 m.
func TestPathTotalMetersIncludesWalks(t *testing.T) {
	path := []pathStep{
		{From: userLocationID, Edge: Edge{ToStopID: "A", RouteID: walkRouteID, DistanceM: 100}},
		{From: "A", Edge: Edge{ToStopID: "B", RouteID: "L1C", DistanceM: 950}},
		{From: "B", Edge: Edge{ToStopID: destinationLocationID, RouteID: walkRouteID, DistanceM: 55}},
	}
	if totalMeters := pathTotalMeters(path); totalMeters != 1105 {
		t.Fatalf("total = %d m, want 1105", totalMeters)
	}
	if totalMeters := pathTotalMeters(nil); totalMeters != 0 {
		t.Fatalf("total of empty path = %d m, want 0", totalMeters)
	}
}

// Las rutas a la universidad siguen informando el mismo tiempo y la misma
// distancia que antes: la suma de sus tramos.
func TestUniversityRoutesUsePathTotals(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 3, defaultCostWeights())
	if err != nil || len(routes) == 0 {
		t.Fatalf("routes = %v, err = %v", routes, err)
	}
	for _, route := range routes {
		expectedSeconds, expectedMeters := 0, 0
		for _, step := range route.Path {
			expectedSeconds += step.Edge.BaseTimeSec
			expectedMeters += step.Edge.DistanceM
		}
		response := newUniversityRouteResponse(route, defaultCostWeights())
		if response.TotalTimeSec != expectedSeconds || response.TotalDistanceM != expectedMeters {
			t.Fatalf("totals = %d s and %d m, want %d s and %d m",
				response.TotalTimeSec, response.TotalDistanceM, expectedSeconds, expectedMeters)
		}
	}
}
