package main

import (
	"strings"
	"testing"

	microv1 "github.com/Juan-Valdebenito/Taller-de-Integracion-3/proto/gen/go/micro/v1"
)

// Cada ruta llega por red con su explicación, con tildes incluidas.
func TestRecommendRoutesOverNetworkExplainEveryRoute(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	request := &microv1.RecommendRoutesRequest{
		Origin: locationMessage(pointNearStop(graph, "PAR-PORTAL-01")), Destination: stopMessage("PAR-CJP-02"),
	}
	paths, err := recommendRoutes(graph, pointNearStop(graph, "PAR-PORTAL-01"), stopPoint("PAR-CJP-02"), defaultRecommendedRoutes, defaultCostWeights(), maxWalkDistanceMeters)
	if err != nil {
		t.Fatal(err)
	}
	routes := recommendOverNetwork(t, client, request).GetRoutes()
	if len(routes) == 0 || len(routes) != len(paths) {
		t.Fatalf("got %d routes, want %d", len(routes), len(paths))
	}
	for routeIndex, route := range routes {
		if expectedText := explainRoute(paths[routeIndex], defaultCostWeights()); expectedText == "" || route.GetExplanation() != expectedText {
			t.Fatalf("route %d = %q, want %q", routeIndex, route.GetExplanation(), expectedText)
		}
	}
}

// La explicación usa la ocupación y el clima de la consulta.
func TestRecommendRoutesOverNetworkExplainLiveData(t *testing.T) {
	graph := loadSeedNetwork(t).buildGraph()
	client := startUniversityGRPCClient(t, graph)
	for _, avoidCrowding := range []bool{true, false} {
		response := recommendOverNetwork(t, client, &microv1.RecommendRoutesRequest{
			Origin: locationMessage(pointNearStop(graph, "PAR-PORTAL-01")), Destination: stopMessage("PAR-CSF-01"), Limit: 1,
			LineOccupancy: fullLinesOccupancy(graph, ""), Weather: badWeather,
			Preferences: &microv1.RoutePreferences{AvoidCrowding: &avoidCrowding},
		})
		text := response.GetRoutes()[0].GetExplanation()
		if strings.Contains(text, "va llena.") != avoidCrowding || !strings.Contains(text, "El clima hace menos cómodo caminar.") {
			t.Fatalf("avoid_crowding=%v: %q", avoidCrowding, text)
		}
	}
}
