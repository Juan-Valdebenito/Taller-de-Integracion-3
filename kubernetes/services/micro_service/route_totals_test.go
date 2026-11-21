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

// Las rutas a la universidad siguen informando el mismo tiempo que antes: la
// suma de sus tramos.
func TestUniversityRoutesUsePathTotalSeconds(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	routes, err := routesToUniversity(graph, "PAR-PORTAL-01", "", 3, defaultCostWeights())
	if err != nil || len(routes) == 0 {
		t.Fatalf("routes = %v, err = %v", routes, err)
	}
	for _, route := range routes {
		expectedSeconds := 0
		for _, step := range route.Path {
			expectedSeconds += step.Edge.BaseTimeSec
		}
		if response := newUniversityRouteResponse(route, defaultCostWeights()); response.TotalTimeSec != expectedSeconds {
			t.Fatalf("total = %d s, want %d", response.TotalTimeSec, expectedSeconds)
		}
	}
}
