package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func testGraph() *TransitGraph {
	graph := NewTransitGraph()
	for _, stop := range []Stop{
		{ID: "A", Name: "A", Latitude: -38.7, Longitude: -72.6},
		{ID: "B", Name: "B", Latitude: -38.701, Longitude: -72.601},
		{ID: "C", Name: "C", Latitude: -38.702, Longitude: -72.602},
		{ID: "D", Name: "D", Latitude: -38.703, Longitude: -72.603},
	} {
		graph.Stops[stop.ID] = stop
	}
	graph.Edges["A"] = []Edge{{ToStopID: "B", RouteID: "L1", TripID: "T1", BaseTimeSec: 60, DistanceM: 500}, {ToStopID: "C", RouteID: "L2", TripID: "T2", BaseTimeSec: 100, DistanceM: 700}}
	graph.Edges["B"] = []Edge{{ToStopID: "D", RouteID: "L1", TripID: "T1", BaseTimeSec: 60, DistanceM: 500}}
	graph.Edges["C"] = []Edge{{ToStopID: "D", RouteID: "L2", TripID: "T2", BaseTimeSec: 100, DistanceM: 700}}
	return graph
}

func TestFastestPathChoosesShortestTime(t *testing.T) {
	path, ok := fastestPath(testGraph(), "A", "D")
	if !ok || len(path) != 2 || path[0].Edge.RouteID != "L1" {
		t.Fatalf("expected L1 fastest path, got %#v, found=%v", path, ok)
	}
}

func TestMinimumTransferPathPrefersNoTransfer(t *testing.T) {
	graph := testGraph()
	graph.Edges["B"] = append(graph.Edges["B"], Edge{ToStopID: "C", RouteID: "L1", TripID: "T1", BaseTimeSec: 300, DistanceM: 100})
	path, ok := minimumTransferPath(graph, "A", "D")
	if !ok || len(path) != 2 || path[0].Edge.RouteID != "L1" || path[1].Edge.RouteID != "L1" {
		t.Fatalf("expected no-transfer L1 path, got %#v, found=%v", path, ok)
	}
	if countTransfers(path) != 0 {
		t.Fatalf("expected zero transfers, got %d", countTransfers(path))
	}
}

func TestStopsFiltersByRadiusAndKeepsTotalMatches(t *testing.T) {
	store := &GraphStore{}
	store.Replace(testGraph())
	server := &Server{store: store}
	req := httptest.NewRequest("GET", "/stops?lat=-38.7&long=-72.6&radius_m=200&limit=1", nil)
	response := httptest.NewRecorder()
	server.stops(response, req)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"total":2`) {
		t.Fatalf("unexpected response: %d %s", response.Code, response.Body.String())
	}
}

func TestReloadRequiresAdminKey(t *testing.T) {
	server := &Server{store: &GraphStore{}, admin: "secret"}
	req := httptest.NewRequest("POST", "/admin/reload-graph", nil)
	response := httptest.NewRecorder()
	server.reloadGraph(response, req)
	if response.Code != 401 {
		t.Fatalf("expected unauthorized response, got %d", response.Code)
	}
}
